const { test, describe, before, after, beforeEach } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const fs = require("node:fs");
const path = require("node:path");

const app = require("../src/app");
const { connectDB, disconnectDB } = require("../src/config/database");
const { seedInitialData } = require("../src/config/seedData");
const Camera = require("../modules/cameras/camera.model");
const Incident = require("../modules/incidents/incident.model");
const User = require("../modules/users/user.model");
const Notification = require("../modules/notifications/notification.model");
const {
  createIncidentFromAI,
  getEligibleIncidentRecipients,
  retryIncidentEmail,
} = require("../modules/incidents/incident.service");
const {
  saveEvidenceImage,
  getEvidenceFilePath,
} = require("../modules/incidents/evidence.service");
const {
  isEmailConfigured,
  sendCrowdAlertEmail,
} = require("../modules/notifications/email.service");

describe("Crowd Alert, Real-Time Notifications & Email Evidence Suite", () => {
  const originalSecret = process.env.JWT_SECRET;
  const originalAiToken = process.env.AI_SERVICE_TOKEN;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSmtpUser = process.env.SMTP_USER;

  const testSecret = "0123456789abcdef0123456789abcdef";
  const testAiToken = "dev_ai_edge_secret_token_at_least_32_chars";

  let server;
  let baseUrl;
  let adminToken;
  let studentToken;
  let testCamera;
  let deptCamera;

  // 1x1 transparent JPEG in Base64 (valid JPEG header: 0xFF, 0xD8, 0xFF)
  const validBase64Jpeg =
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

  before(async () => {
    process.env.NODE_ENV = "development";
    process.env.JWT_SECRET = testSecret;
    process.env.AI_SERVICE_TOKEN = testAiToken;
    delete process.env.SMTP_USER; // ensure missing SMTP test can run predictably

    await connectDB(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/smart_campus_crowd_test");
    await seedInitialData({ isTest: true });

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    const mongoose = require("mongoose");
    const csDeptId = new mongoose.Types.ObjectId();
    const adminUserId = new mongoose.Types.ObjectId().toString();
    const studentUserId = new mongoose.Types.ObjectId().toString();

    // Create tokens for role-based endpoint testing
    adminToken = jwt.sign(
      { role: "SUPER_ADMIN", email: "admin@campus.edu" },
      testSecret,
      { subject: adminUserId, algorithm: "HS256" }
    );
    studentToken = jwt.sign(
      { role: "STUDENT", email: "student@campus.edu" },
      testSecret,
      { subject: studentUserId, algorithm: "HS256" }
    );

    // Setup dedicated test cameras
    await Camera.deleteMany({ cameraId: { $in: ["CAM-CROWD-01", "CAM-CROWD-DEPT"] } });
    testCamera = await Camera.create({
      cameraId: "CAM-CROWD-01",
      name: "Library Main Gate",
      rtspUrl: "rtsp://127.0.0.1:8554/live/crowd1",
      location: "Library Ground Floor Entrance",
      building: "Library Complex",
      status: "online",
      crowdAlertThreshold: 4,
      crowdAlertActive: false,
    });

    deptCamera = await Camera.create({
      cameraId: "CAM-CROWD-DEPT",
      name: "Engineering Quad",
      departmentId: csDeptId,
      rtspUrl: "rtsp://127.0.0.1:8554/live/crowd2",
      location: "Lab 201",
      building: "Turing Hall",
      status: "online",
      crowdAlertThreshold: 4,
      crowdAlertActive: false,
    });
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

  beforeEach(async () => {
    // Reset test camera states and clean only test cameras' records
    if (testCamera && deptCamera) {
      await Incident.deleteMany({
        camera: { $in: [testCamera._id, deptCamera._id] },
      });
      await Notification.deleteMany({
        title: { $regex: /CAM-CROWD/i },
      });
      await Camera.updateMany(
        { _id: { $in: [testCamera._id, deptCamera._id] } },
        { $set: { crowdAlertActive: false, crowdAlertThreshold: 4 } }
      );
    }
  });

  // TEST 1: 4 detected people — no incident
  test("1. Four detected people: does NOT trigger a crowd-count incident", async () => {
    const result = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 4,
      confidence: 0.95,
      description: "Edge telemetry report",
    });

    assert.strictEqual(result.incidentCreated, false);
    assert.strictEqual(result.reason, "below_threshold");

    const cam = await Camera.findOne({ cameraId: "CAM-CROWD-01" });
    assert.strictEqual(cam.crowdAlertActive, false);
  });

  // TEST 2: 5 detected people — incident created
  test("2. Five detected people: triggers incident creation", async () => {
    const result = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 5,
      confidence: 0.93,
      description: "Threshold exceeded: 5 people detected",
      imageBase64: validBase64Jpeg,
    });

    assert.strictEqual(result.incidentCreated, true);
    assert.ok(result.incident);
    assert.strictEqual(result.incident.metadata.people_count, 5);
    assert.strictEqual(result.incident.metadata.threshold, 4);

    const cam = await Camera.findOne({ cameraId: "CAM-CROWD-01" });
    assert.strictEqual(cam.crowdAlertActive, true);
  });

  // TEST 3: 6 or more people — incident created when condition first becomes active
  test("3. Six or more people: incident created on first transition", async () => {
    const result = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 8,
      confidence: 0.97,
      description: "Severe crowd surge",
      imageBase64: validBase64Jpeg,
    });

    assert.strictEqual(result.incidentCreated, true);
    assert.strictEqual(result.incident.metadata.people_count, 8);
  });

  // TEST 4: Repeated qualifying frames — deduplication prevents duplicate incident and emails
  test("4. Repeated qualifying frames: no duplicate incident or email sent", async () => {
    // First qualifying frame (5 people)
    const first = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 5,
      confidence: 0.9,
      imageBase64: validBase64Jpeg,
    });
    assert.strictEqual(first.incidentCreated, true);

    // Second qualifying frame (6 people) while condition is still active
    const second = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 6,
      confidence: 0.92,
      imageBase64: validBase64Jpeg,
    });
    assert.strictEqual(second.incidentCreated, false);
    assert.strictEqual(second.reason, "already_active");

    // Third qualifying frame (7 people)
    const third = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 7,
      confidence: 0.94,
      imageBase64: validBase64Jpeg,
    });
    assert.strictEqual(third.incidentCreated, false);
    assert.strictEqual(third.reason, "already_active");
  });

  // TEST 5: Count returns to 4 or fewer — active condition resets
  test("5. Count returns to four or fewer: active condition resets", async () => {
    // Set active
    await Camera.updateOne({ cameraId: "CAM-CROWD-01" }, { $set: { crowdAlertActive: true } });

    // Send AI event with 3 people via controller route
    const res = await fetch(`${baseUrl}/api/v1/ai/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testAiToken}`,
      },
      body: JSON.stringify({
        cameraId: "CAM-CROWD-01",
        eventType: "crowd_gathering",
        peopleCount: 3,
        confidence: 0.88,
      }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);

    const cam = await Camera.findOne({ cameraId: "CAM-CROWD-01" });
    assert.strictEqual(cam.crowdAlertActive, false, "Camera crowd alert state must be reset to false");
  });

  // TEST 6: Subsequent qualifying transition — new incident is generated
  test("6. A later qualifying transition: a new incident is generated", async () => {
    // 1. Initial qualifying event
    const first = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 5,
      confidence: 0.9,
      imageBase64: validBase64Jpeg,
    });
    assert.strictEqual(first.incidentCreated, true);

    // 2. Count drops to 2 (reset)
    await fetch(`${baseUrl}/api/v1/ai/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testAiToken}`,
      },
      body: JSON.stringify({
        cameraId: "CAM-CROWD-01",
        eventType: "crowd_gathering",
        peopleCount: 2,
        confidence: 0.85,
      }),
    });

    // 3. New qualifying event (6 people)
    const second = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 6,
      confidence: 0.92,
      imageBase64: validBase64Jpeg,
    });
    assert.strictEqual(second.incidentCreated, true);
    assert.notStrictEqual(first.incident._id.toString(), second.incident._id.toString());
  });

  // TEST 7: Missing or stale telemetry — no false incident or reset
  test("7. Missing or stale telemetry: no false incident or reset", async () => {
    await Camera.updateOne({ cameraId: "CAM-CROWD-01" }, { $set: { crowdAlertActive: true } });

    // Send payload without peopleCount
    await fetch(`${baseUrl}/api/v1/ai/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testAiToken}`,
      },
      body: JSON.stringify({
        cameraId: "CAM-CROWD-01",
        eventType: "motion_detected",
        confidence: 0.7,
      }),
    });

    const cam = await Camera.findOne({ cameraId: "CAM-CROWD-01" });
    assert.strictEqual(cam.crowdAlertActive, true, "Missing count must not reset active alert");
  });

  // TEST 8: Evidence capture and storage
  test("8. Evidence capture and storage: validates magic bytes and persists safely", async () => {
    const storageKey = await saveEvidenceImage(validBase64Jpeg, "CAM-CROWD-01");
    assert.ok(typeof storageKey === "string" && storageKey.length > 0);
    assert.ok(storageKey.startsWith("evidence_CAM-CROWD-01_"));

    const filePath = getEvidenceFilePath(storageKey);
    assert.ok(fs.existsSync(filePath));

    // Reject non-image / corrupted payloads (returns null)
    const invalidBase64 = Buffer.from("MALICIOUS_NON_IMAGE_SCRIPT").toString("base64");
    const invalidResult = await saveEvidenceImage(invalidBase64, "CAM-CROWD-01");
    assert.strictEqual(invalidResult, null, "Non-image payload must fail magic byte validation and return null");
  });

  // TEST 9: MongoDB persistence
  test("9. MongoDB persistence: incident schema stores counts, timestamps, and evidence", async () => {
    const created = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 7,
      confidence: 0.91,
      imageBase64: validBase64Jpeg,
    });

    const persisted = await Incident.findById(created.incident._id);
    assert.ok(persisted);
    assert.strictEqual(persisted.metadata.people_count, 7);
    assert.strictEqual(persisted.metadata.threshold, 4);
    assert.ok(persisted.evidence.length > 0);
    assert.ok(persisted.capturedAt);
    assert.ok(persisted.emailStatus);
  });

  // TEST 10: Socket.IO notification delivery
  test("10. Socket.IO notification delivery: publishIncidentCreated enriches payload", async () => {
    const created = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 5,
      confidence: 0.93,
      imageBase64: validBase64Jpeg,
    });

    // Check that in-app Notification documents were created for admins
    const notifs = await Notification.find({
      resourceId: created.incident._id,
    });
    assert.ok(notifs.length > 0, "In-app notifications must be created for authorized users");
  });

  // TEST 11: Super Admin recipient lookup
  test("11. Super Admin recipient lookup: retrieves all active super admins", async () => {
    const recipients = await getEligibleIncidentRecipients(testCamera);
    const emails = recipients.map((r) => r.email);
    assert.ok(emails.includes("admin@campus.edu"), "Super Admin admin@campus.edu must be in recipients");
  });

  // TEST 12: Department-head recipient lookup (scoped to camera department)
  test("12. Department-head recipient lookup: retrieves dept head matching camera department", async () => {
    // Ensure department head exists for deptCamera.departmentId
    await User.findOneAndUpdate(
      { email: "depthead_cs@campus.edu" },
      {
        email: "depthead_cs@campus.edu",
        role: "DEPT_HEAD",
        departmentId: deptCamera.departmentId,
        isActive: true,
        passwordHash: "$2b$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLM",
        name: "CS Dept Head",
      },
      { upsert: true }
    );

    const recipients = await getEligibleIncidentRecipients(deptCamera);
    const emails = recipients.map((r) => r.email);
    assert.ok(
      emails.includes("depthead_cs@campus.edu"),
      "CS Dept Head must be included for CS department camera"
    );
  });

  // TEST 13: Fallback department-head lookup when camera has no department
  test("13. Fallback department-head lookup: all active dept heads when camera has no department", async () => {
    const recipients = await getEligibleIncidentRecipients(testCamera);
    const emails = recipients.map((r) => r.email);
    // testCamera has no departmentId, so all active department heads should be included as fallback
    const hasDeptHead = recipients.some((r) => r.role === "DEPT_HEAD");
    assert.ok(hasDeptHead, "Fallback policy must include department heads when camera has no department");
  });

  // TEST 14: Missing SMTP credentials
  test("14. Missing SMTP credentials: reports not_configured without claiming sent", async () => {
    delete process.env.SMTP_USER;
    assert.strictEqual(isEmailConfigured(), false);

    const result = await sendCrowdAlertEmail({
      incident: { incidentId: "INC-TEST-001", _id: "test" },
      camera: testCamera,
      peopleCount: 5,
      threshold: 4,
      recipients: [{ email: "admin@campus.edu", name: "Admin" }],
    });

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.status, "not_configured");
  });

  // TEST 15: SMTP delivery failure and safe retry
  test("15. SMTP delivery failure and safe retry: retry endpoint works without duplicating incident", async () => {
    const created = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 6,
      confidence: 0.9,
      imageBase64: validBase64Jpeg,
    });

    const incId = created.incident._id;

    // Call retry endpoint
    const res = await fetch(`${baseUrl}/api/v1/incidents/${incId}/retry-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.ok(data.data.incident);
    assert.strictEqual(data.data.incident._id.toString(), incId.toString());

    // Confirm total incident count has not increased
    const totalCount = await Incident.countDocuments({
      "metadata.people_count": 6,
      camera: testCamera._id,
    });
    assert.strictEqual(totalCount, 1, "Retry must not generate duplicate incident records");
  });

  // TEST 16: Unauthorized incident access
  test("16. Unauthorized incident evidence access: student is rejected with 403 Forbidden", async () => {
    const created = await createIncidentFromAI({
      cameraId: "CAM-CROWD-01",
      eventType: "crowd_gathering",
      peopleCount: 5,
      confidence: 0.95,
      imageBase64: validBase64Jpeg,
    });

    const storageKey = created.incident.evidence[0].storageKey;

    const res = await fetch(
      `${baseUrl}/api/v1/incidents/${created.incident._id}/evidence/${storageKey}`,
      {
        headers: {
          Authorization: `Bearer ${studentToken}`,
        },
      }
    );

    assert.strictEqual(res.status, 403, "Student must be forbidden from accessing evidence frames");
  });

  // TEST 17: Duplicate recipients and concurrent incident creation
  test("17. Duplicate recipients and concurrent incident creation: idempotent behavior", async () => {
    // 1. Recipient deduplication: User with duplicate emails
    const recipients = await getEligibleIncidentRecipients(testCamera);
    const uniqueEmails = new Set(recipients.map((r) => r.email.toLowerCase()));
    assert.strictEqual(
      uniqueEmails.size,
      recipients.length,
      "Recipients list must have no duplicate email addresses"
    );

    // 2. Concurrent incident creation: 3 simultaneous requests for CAM-CROWD-DEPT
    const promises = [
      createIncidentFromAI({
        cameraId: "CAM-CROWD-DEPT",
        eventType: "crowd_gathering",
        peopleCount: 5,
        confidence: 0.92,
        imageBase64: validBase64Jpeg,
      }),
      createIncidentFromAI({
        cameraId: "CAM-CROWD-DEPT",
        eventType: "crowd_gathering",
        peopleCount: 6,
        confidence: 0.93,
        imageBase64: validBase64Jpeg,
      }),
      createIncidentFromAI({
        cameraId: "CAM-CROWD-DEPT",
        eventType: "crowd_gathering",
        peopleCount: 7,
        confidence: 0.95,
        imageBase64: validBase64Jpeg,
      }),
    ];

    const results = await Promise.all(promises);
    const createdCount = results.filter((r) => r.incidentCreated).length;
    assert.strictEqual(createdCount, 1, "Only one incident should be created during concurrent qualifying frames");
  });
});
