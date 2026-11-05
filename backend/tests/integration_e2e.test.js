const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const app = require("../src/app");
const { connectDB, disconnectDB } = require("../src/config/database");
const { seedInitialData } = require("../src/config/seedData");
const { roles, incident: incidentConstants } = require("../../shared/constants.json");
const { sanitizeEvidenceForUser, createEvidenceRecord } = require("../modules/incidents/evidence.service");
const { getAuthorizedRooms, isRoomAuthorized } = require("../src/realtime/socketRooms");

describe("Step 9 — Full Integration, Security Audit & E2E Verification", () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalAiToken = process.env.AI_SERVICE_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSmtpUser = process.env.SMTP_USER;

  const testSecret = "0123456789abcdef0123456789abcdef";
  const testAiToken = "dev_ai_edge_secret_token_at_least_32_chars";

  let server;
  let baseUrl;
  let adminToken;
  let deptHeadToken;
  let facultyToken;
  let studentToken;

  before(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = testSecret;
    process.env.AI_SERVICE_TOKEN = testAiToken;
    delete process.env.SMTP_USER; // prevent automated test runs from delivering live emails

    // Connect to embedded database and seed initial test fixtures
    await connectDB(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_campus_e2e");
    await seedInitialData({ isTest: true });

    const Camera = require("../modules/cameras/camera.model");
    const Incident = require("../modules/incidents/incident.model");
    const cam001 = await Camera.findOne({ cameraId: "CAM-001" });
    if (cam001) {
      cam001.crowdAlertActive = false;
      await cam001.save();
      await Incident.deleteMany({ camera: cam001._id });
    }

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    // Authenticate all four roles to obtain verified JWT tokens for downstream checks
    const adminRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@campus.edu", password: "Admin@123456" }),
    });
    const adminData = await adminRes.json();
    adminToken = adminData.data?.token;

    const deptHeadRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "depthead@campus.edu", password: "DeptHead@123456" }),
    });
    const deptHeadData = await deptHeadRes.json();
    deptHeadToken = deptHeadData.data?.token;

    const facultyRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "faculty@campus.edu", password: "Faculty@123456" }),
    });
    const facultyData = await facultyRes.json();
    facultyToken = facultyData.data?.token;

    const studentRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "student@campus.edu", password: "Student@123456" }),
    });
    const studentData = await studentRes.json();
    studentToken = studentData.data?.token;
  });

  after(async () => {
    process.env.JWT_SECRET = originalSecret;
    process.env.AI_SERVICE_TOKEN = originalAiToken;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSmtpUser) process.env.SMTP_USER = originalSmtpUser;

    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await disconnectDB();
  });

  describe("1. System Health & Infrastructure", () => {
    test("GET /api/v1/health returns 200 with database connected", async () => {
      const res = await fetch(`${baseUrl}/api/v1/health`);
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.database, "connected");
      assert.ok(typeof data.uptime === "number");
    });
  });

  describe("2. Authentication & Session Security", () => {
    test("validates that all four seeded roles obtain valid tokens", () => {
      assert.ok(adminToken, "Admin token must exist");
      assert.ok(deptHeadToken, "Dept Head token must exist");
      assert.ok(facultyToken, "Faculty token must exist");
      assert.ok(studentToken, "Student token must exist");
    });

    test("GET /api/v1/auth/me returns public profile without passwordHash", async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.data.user.role, roles.SUPER_ADMIN);
      assert.strictEqual(data.data.user.passwordHash, undefined);
      assert.strictEqual(data.data.user.password, undefined);
    });

    test("tampered JWT signature is rejected with 401", async () => {
      const tamperedToken = adminToken.slice(0, -6) + "xxxxxx";
      const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.message, "Invalid authentication token.");
    });

    test("expired token is rejected with 401 and specific expiration error", async () => {
      const expiredToken = jwt.sign(
        { role: roles.SUPER_ADMIN },
        testSecret,
        { subject: "admin-exp", expiresIn: "-10s", algorithm: "HS256" }
      );
      const res = await fetch(`${baseUrl}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.message, "Authentication token has expired.");
    });

    test("login with wrong password returns 401 without exposing account existence", async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@campus.edu", password: "WrongPassword!999" }),
      });
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.message, "Invalid email or password.");
    });
  });

  describe("3. Role Boundaries & Access Control", () => {
    test("STUDENT is strictly forbidden from cameras (GET /api/v1/cameras -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    test("STUDENT is strictly forbidden from incidents (GET /api/v1/incidents -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/incidents`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    test("STUDENT is strictly forbidden from user management (GET /api/v1/users -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/users`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    test("FACULTY cannot access user administration (GET /api/v1/users -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/users`, {
        headers: { Authorization: `Bearer ${facultyToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    test("FACULTY can list authorized cameras (GET /api/v1/cameras -> 200)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        headers: { Authorization: `Bearer ${facultyToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.data.cameras));
    });

    test("STUDENT can access public parking availability (GET /api/v1/parking -> 200)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/parking`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.data.parking.length > 0);
    });

    test("STUDENT can access public occupancy levels (GET /api/v1/occupancy -> 200)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/occupancy`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.ok(data.data.occupancy.length > 0);
    });
  });

  describe("4. AI Edge Service Integration & Deduplication", () => {
    test("rejects AI submission without Bearer token with 401", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_id: "CAM-001", event_type: "crowd_overcrowding" }),
      });
      assert.strictEqual(res.status, 401);
    });

    test("rejects AI submission with invalid token with 401", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid-ai-secret",
        },
        body: JSON.stringify({ camera_id: "CAM-001", event_type: "crowd_overcrowding" }),
      });
      assert.strictEqual(res.status, 401);
    });

    test("rejects AI submission with unregistered camera ID with 404", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testAiToken}`,
        },
        body: JSON.stringify({
          camera_id: "NON_EXISTENT_CAM_999",
          event_type: "crowd_overcrowding",
        }),
      });
      assert.strictEqual(res.status, 404);
    });

    test("successfully creates incident from valid AI event (CAM-001)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testAiToken}`,
        },
        body: JSON.stringify({
          camera_id: "CAM-001",
          event_type: "crowd_overcrowding",
          severity: "warning",
          confidence: 0.94,
          message: "Sustained crowd surge detected at North Campus Main Entrance.",
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.deduplicated, false);
      assert.strictEqual(data.data.incident.eventType, "crowd_overcrowding");
      assert.strictEqual(data.data.incident.status, "new");
    });

    test("deduplicates subsequent rapid AI event on same camera within 5-minute window", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testAiToken}`,
        },
        body: JSON.stringify({
          camera_id: "CAM-001",
          event_type: "crowd_overcrowding",
          severity: "critical",
          confidence: 0.98,
          message: "Follow-up crowd measurement within persistence window.",
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.deduplicated, true);
      assert.strictEqual(data.data.incident.confidence, 0.98);
    });
  });

  describe("5. Incident State Machine & Authorized Transitions", () => {
    let incidentId;

    test("retrieves seeded incident for transition testing", async () => {
      const res = await fetch(`${baseUrl}/api/v1/incidents`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      const newInc = data.data.incidents.find((i) => i.status === "new");
      assert.ok(newInc, "Must find at least one new incident");
      incidentId = newInc._id || newInc.id;
    });

    test("transitions incident from 'new' to 'acknowledged' (200 OK)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/incidents/${incidentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: "acknowledged" }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.data.incident.status, "acknowledged");
    });

    test("transitions incident from 'acknowledged' to 'investigating' (200 OK)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/incidents/${incidentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: "investigating" }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.data.incident.status, "investigating");
    });

    test("transitions incident from 'investigating' to 'resolved' (200 OK)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/incidents/${incidentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: "resolved" }),
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.data.incident.status, "resolved");
    });

    test("blocks forbidden transition from terminal state 'resolved' back to 'new' (409 Conflict)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/incidents/${incidentId}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: "new" }),
      });
      assert.strictEqual(res.status, 409);
      const data = await res.json();
      assert.ok(data.message.includes("Cannot transition"));
    });
  });

  describe("6. Evidence Privacy & Retention Protections", () => {
    test("completely strips evidence items for STUDENT role", () => {
      const studentUser = { id: "s-1", role: roles.STUDENT };
      const rawEvidence = [
        createEvidenceRecord({ storageKey: "evidence/burst-1.jpg" }),
        createEvidenceRecord({ storageKey: "evidence/burst-2.jpg" }),
      ];

      const sanitized = sanitizeEvidenceForUser(studentUser, rawEvidence);
      assert.deepStrictEqual(sanitized, []);
    });

    test("retains active unexpired evidence for staff with 30-day retention", () => {
      const staffUser = { id: "a-1", role: roles.SUPER_ADMIN };
      const rawEvidence = [
        createEvidenceRecord({ storageKey: "evidence/burst-1.jpg" }),
      ];

      const sanitized = sanitizeEvidenceForUser(staffUser, rawEvidence);
      assert.strictEqual(sanitized.length, 1);
      assert.strictEqual(sanitized[0].storageKey, "evidence/burst-1.jpg");
      assert.ok(sanitized[0].expiresAt > new Date());
    });
  });

  describe("7. Realtime Socket.IO Authorization & Boundaries", () => {
    test("STUDENT is strictly confined to user room and role:STUDENT room", () => {
      const student = { id: "student-123", role: roles.STUDENT };
      const rooms = getAuthorizedRooms(student);

      assert.ok(rooms.includes("user:student-123"));
      assert.ok(rooms.includes("role:STUDENT"));
      assert.strictEqual(rooms.includes("role:SUPER_ADMIN"), false);
      assert.strictEqual(rooms.includes("system:global"), false);
      assert.strictEqual(isRoomAuthorized(student, "role:SUPER_ADMIN"), false);
      assert.strictEqual(isRoomAuthorized(student, "department:eng-dept"), false);
    });

    test("SUPER_ADMIN authorized rooms include global alerts and admin role", () => {
      const admin = { id: "admin-1", role: roles.SUPER_ADMIN };
      const rooms = getAuthorizedRooms(admin);

      assert.ok(rooms.includes("role:SUPER_ADMIN"));
      assert.ok(rooms.includes("system:global"));
      assert.strictEqual(isRoomAuthorized(admin, "system:global"), true);
    });
  });

  describe("8. Input Validation & IDOR Protection", () => {
    test("PATCH /api/v1/incidents/malformed-id/status rejects with 400", async () => {
      const res = await fetch(`${baseUrl}/api/v1/incidents/not-a-mongo-id-99/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ status: "acknowledged" }),
      });
      assert.strictEqual(res.status, 400);
    });

    test("GET /api/v1/cameras/malformed-id rejects with 400", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras/not-a-valid-mongo-id-123`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert.strictEqual(res.status, 400);
    });
  });
});
