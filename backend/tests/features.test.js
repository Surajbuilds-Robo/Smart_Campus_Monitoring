const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const app = require("../src/app");
const { roles, incident: incidentConstants, occupancy: occupancyConstants } = require("../../shared/constants.json");
const { createEvidenceRecord, isEvidenceExpired, sanitizeEvidenceForUser } = require("../modules/incidents/evidence.service");
const { calculateLevel } = require("../modules/occupancy/occupancy.service");
const { recordAudit, listAuditLogs } = require("../modules/audit/audit.service");

describe("Backend Feature Modules Suite", () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalAiToken = process.env.AI_SERVICE_TOKEN;
  const testSecret = "0123456789abcdef0123456789abcdef";
  const testAiToken = "test-ai-edge-token-secure-123456";

  let server;
  let baseUrl;

  before(async () => {
    process.env.JWT_SECRET = testSecret;
    process.env.AI_SERVICE_TOKEN = testAiToken;

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    process.env.JWT_SECRET = originalSecret;
    process.env.AI_SERVICE_TOKEN = originalAiToken;
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  function makeToken(role, sub = "user-123", departmentId = null) {
    return jwt.sign(
      { role, departmentId },
      testSecret,
      { subject: sub, algorithm: "HS256" }
    );
  }

  describe("Incident Transitions & Lifecycle Rules", () => {
    const transitions = incidentConstants.transitions;

    test("permitted status transitions match specification", () => {
      assert.deepStrictEqual(transitions["new"], ["acknowledged", "dismissed"]);
      assert.deepStrictEqual(transitions["acknowledged"], ["investigating", "resolved", "dismissed"]);
      assert.deepStrictEqual(transitions["investigating"], ["resolved", "dismissed"]);
      assert.deepStrictEqual(transitions["resolved"], []);
      assert.deepStrictEqual(transitions["dismissed"], []);
    });

    test("terminal states (resolved, dismissed) have zero permitted forward transitions", () => {
      assert.strictEqual(transitions["resolved"].length, 0);
      assert.strictEqual(transitions["dismissed"].length, 0);
    });
  });

  describe("Evidence Retention & Privacy Protections", () => {
    test("createEvidenceRecord sets 30-day retention window", () => {
      const capturedAt = new Date("2026-01-01T10:00:00.000Z");
      const record = createEvidenceRecord({
        storageKey: "evidence/cam1/frame123.jpg",
        capturedAt,
      });

      assert.strictEqual(record.storageKey, "evidence/cam1/frame123.jpg");
      assert.strictEqual(record.capturedAt.toISOString(), capturedAt.toISOString());

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      assert.strictEqual(
        record.expiresAt.getTime() - record.capturedAt.getTime(),
        thirtyDaysMs
      );
    });

    test("isEvidenceExpired correctly identifies expired items", () => {
      const past = new Date(Date.now() - 10000);
      const future = new Date(Date.now() + 10000);

      assert.strictEqual(isEvidenceExpired({ expiresAt: past }), true);
      assert.strictEqual(isEvidenceExpired({ expiresAt: future }), false);
      assert.strictEqual(isEvidenceExpired(null), true);
    });

    test("sanitizeEvidenceForUser strips all evidence for STUDENT role", () => {
      const studentUser = { id: "student-1", role: roles.STUDENT };
      const evidence = [
        {
          storageKey: "secret/frame.jpg",
          capturedAt: new Date(),
          expiresAt: new Date(Date.now() + 100000),
        },
      ];

      const sanitized = sanitizeEvidenceForUser(studentUser, evidence);
      assert.deepStrictEqual(sanitized, []);
    });

    test("sanitizeEvidenceForUser retains active evidence for staff", () => {
      const staffUser = { id: "faculty-1", role: roles.FACULTY };
      const evidence = [
        {
          storageKey: "dept/frame.jpg",
          capturedAt: new Date(),
          expiresAt: new Date(Date.now() + 100000),
        },
      ];

      const sanitized = sanitizeEvidenceForUser(staffUser, evidence);
      assert.strictEqual(sanitized.length, 1);
      assert.strictEqual(sanitized[0].storageKey, "dept/frame.jpg");
    });
  });

  describe("Occupancy Threshold Calculations", () => {
    test("calculateLevel accurately enforces warning (0.7) and critical (0.9) thresholds", () => {
      assert.strictEqual(calculateLevel(0.95), "critical");
      assert.strictEqual(calculateLevel(0.90), "critical");
      assert.strictEqual(calculateLevel(0.89), "warning");
      assert.strictEqual(calculateLevel(0.70), "warning");
      assert.strictEqual(calculateLevel(0.69), "normal");
      assert.strictEqual(calculateLevel(0.0), "normal");
    });
  });

  describe("Audit Logging", () => {
    test("listAuditLogs enforces access restrictions", async () => {
      const studentUser = { id: "student-1", role: roles.STUDENT };

      await assert.rejects(
        async () => {
          await listAuditLogs(studentUser);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  describe("AI Ingestion Route Authentication & Contracts (/api/v1/ai/events)", () => {
    test("rejects request without Authorization header with 401", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ camera_id: "CAM-01", event_type: "crowd_overcrowding" }),
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes("token is required"));
    });

    test("rejects request with invalid token with 401", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer wrong-token-xyz",
        },
        body: JSON.stringify({ camera_id: "CAM-01", event_type: "crowd_overcrowding" }),
      });

      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes("Invalid AI service token"));
    });

    test("valid token is accepted through middleware and reaches controller validation", async () => {
      const res = await fetch(`${baseUrl}/api/v1/ai/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testAiToken}`,
        },
        body: JSON.stringify({
          camera_id: "CAM-01",
          // missing event_type
        }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.ok(data.message.includes("Camera ID and event type are required"));
    });
  });

  describe("Role Boundaries on Feature Routes", () => {
    test("POST /api/v1/cameras forbids STUDENT role with 403", async () => {
      const studentToken = makeToken(roles.STUDENT);

      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          name: "Student Camera",
          cameraId: "CAM-STUDENT-01",
          location: "Library",
        }),
      });

      assert.strictEqual(res.status, 403);
    });

    test("POST /api/v1/parking forbids STUDENT role with 403", async () => {
      const studentToken = makeToken(roles.STUDENT);

      const res = await fetch(`${baseUrl}/api/v1/parking`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          name: "Student Parking",
          zoneId: "ZONE-S1",
          location: "Gate 1",
          totalSpaces: 50,
        }),
      });

      assert.strictEqual(res.status, 403);
    });

    test("GET /api/v1/notifications requires authentication (401 without token)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/notifications`);
      assert.strictEqual(res.status, 401);
    });

    test("GET /api/v1/cameras/:id/stream forbids STUDENT role with 403", async () => {
      const studentToken = makeToken(roles.STUDENT);
      const res = await fetch(`${baseUrl}/api/v1/cameras/65f1a2b3c4d5e6f7a8b9c0d1/stream`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    test("GET /api/v1/cameras/:id/analytics forbids STUDENT role with 403", async () => {
      const studentToken = makeToken(roles.STUDENT);
      const res = await fetch(`${baseUrl}/api/v1/cameras/65f1a2b3c4d5e6f7a8b9c0d1/analytics`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    test("POST /api/v1/cameras/:id/verify forbids STUDENT role with 403", async () => {
      const studentToken = makeToken(roles.STUDENT);
      const res = await fetch(`${baseUrl}/api/v1/cameras/65f1a2b3c4d5e6f7a8b9c0d1/verify`, {
        method: "POST",
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    test("POST /api/v1/cameras/verify-stream forbids STUDENT role with 403", async () => {
      const studentToken = makeToken(roles.STUDENT);
      const res = await fetch(`${baseUrl}/api/v1/cameras/verify-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({ streamUrl: "http://192.168.1.50:8080/video" }),
      });
      assert.strictEqual(res.status, 403);
    });

    test("GET /api/v1/cameras/:id/stream-proxy forbids STUDENT role with 403", async () => {
      const studentToken = makeToken(roles.STUDENT);
      const res = await fetch(`${baseUrl}/api/v1/cameras/65f1a2b3c4d5e6f7a8b9c0d1/stream-proxy`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    test("POST /api/v1/cameras rejects SSRF cloud metadata endpoint with 400", async () => {
      const adminToken = makeToken(roles.SUPER_ADMIN);
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          name: "Test SSRF Block",
          cameraId: "CAM-SSRF-99",
          location: "Lab",
          streamUrl: "http://169.254.169.254/latest/meta-data/",
        }),
      });
      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      const hasCloudError =
        (data.message && data.message.includes("cloud metadata")) ||
        (Array.isArray(data.errors) && data.errors.some((e) => e.msg && e.msg.includes("cloud metadata")));
      assert.ok(hasCloudError, "Expected cloud metadata error message");
    });

    test("PATCH /api/v1/incidents/invalid-id/status validates mongoId with 400", async () => {
      const staffToken = makeToken(roles.SUPER_ADMIN);

      const res = await fetch(`${baseUrl}/api/v1/incidents/invalid-id-123/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${staffToken}`,
        },
        body: JSON.stringify({ status: "acknowledged" }),
      });

      assert.strictEqual(res.status, 400);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.message, "Validation failed.");
    });
  });
});

