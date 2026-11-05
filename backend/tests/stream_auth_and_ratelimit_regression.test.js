const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const Camera = require("../modules/cameras/camera.model");
const User = require("../modules/users/user.model");
const { roles } = require("../../shared/constants.json");
const { createToken } = require("../modules/auth/auth.service");

let mongod;
let server;
let baseUrl;

describe("Stream Authentication & Rate Limiting Regression Suite", () => {
  let superAdminUser, superAdminToken;
  let studentUser, studentToken;
  let facultyUser, facultyToken;
  let testCamera;

  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });

    superAdminUser = await User.create({
      name: "Admin Tester",
      email: "admin_stream_test@campus.edu",
      passwordHash: "hash123",
      role: roles.SUPER_ADMIN,
    });
    superAdminToken = createToken(superAdminUser);

    facultyUser = await User.create({
      name: "Faculty Tester",
      email: "faculty_stream_test@campus.edu",
      passwordHash: "hash123",
      role: roles.FACULTY,
    });
    facultyToken = createToken(facultyUser);

    studentUser = await User.create({
      name: "Student Tester",
      email: "student_stream_test@campus.edu",
      passwordHash: "hash123",
      role: roles.STUDENT,
    });
    studentToken = createToken(studentUser);

    testCamera = await Camera.create({
      name: "Main Quad South Gate",
      cameraId: "CAM-STREAM-TEST",
      location: "Main Quad",
      streamUrl: "http://127.0.0.1:8080/video",
      streamType: "mjpeg",
      status: "online",
      lastHeartbeat: new Date(),
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
    if (mongod) {
      await mongod.stop();
    }
  });

  test("1. GET /api/v1/cameras/:id/stream-ticket requires authentication", async () => {
    const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream-ticket`);
    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /token is required/i);
  });

  test("2. STUDENT is strictly forbidden from generating stream tickets (403)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream-ticket`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert.strictEqual(res.status, 403);
  });

  test("3. Authorized staff (SUPER_ADMIN) generates valid short-lived stream ticket", async () => {
    const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream-ticket`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.ticket, "Must provide a ticket string");
    assert.strictEqual(body.data.expiresIn, 120, "Ticket must be short-lived (120s)");
    assert.ok(body.data.proxyUrl.includes("stream-proxy?ticket="), "Proxy URL must include ticket");

    // Verify ticket structure
    const decoded = jwt.verify(body.data.ticket, process.env.JWT_SECRET);
    assert.strictEqual(decoded.ticketType, "stream");
    assert.strictEqual(decoded.sub, String(superAdminUser._id));
    assert.strictEqual(decoded.cameraId, String(testCamera._id));
  });

  test("4. getStreamInfo automatically attaches streamTicket and ticketed proxyUrl", async () => {
    const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream`, {
      headers: { Authorization: `Bearer ${facultyToken}` },
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(body.data.stream.streamTicket, "Stream info must provide streamTicket");
    assert.ok(body.data.stream.proxyUrl.includes("ticket="), "proxyUrl must have ticket query attached");
    assert.ok(body.data.stream.annotatedProxyUrl.includes("ticket="), "annotatedProxyUrl must have ticket query attached");
  });

  test("5. Stream endpoints accept valid stream ticket without Authorization header", async () => {
    // Generate fresh ticket
    const ticketRes = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream-ticket`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const { data } = await ticketRes.json();

    // Request stream with ticket in query and NO Authorization header (simulates native <img>)
    const streamRes = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream-proxy?ticket=${data.ticket}`);
    // Should NOT return 401 Unauthorized!
    // Since mock camera URL is offline, it returns 502 Bad Gateway from proxyMjpegStream, proving authentication passed!
    assert.notStrictEqual(streamRes.status, 401, "Valid stream ticket must NOT return 401");
    assert.notStrictEqual(streamRes.status, 403, "Valid stream ticket must NOT return 403");
  });

  test("6. Stream endpoints reject tampered or invalid stream ticket with 401", async () => {
    const streamRes = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream-proxy?ticket=tampered_invalid_token`);
    assert.strictEqual(streamRes.status, 401);
    const body = await streamRes.json();
    assert.strictEqual(body.success, false);
    assert.match(body.message, /invalid authentication token/i);
  });

  test("7. Stream endpoints reject expired stream ticket with 401", async () => {
    const expiredTicket = jwt.sign(
      {
        sub: String(superAdminUser._id),
        role: superAdminUser.role,
        ticketType: "stream",
        cameraId: String(testCamera._id),
      },
      process.env.JWT_SECRET,
      { expiresIn: "-1s" }
    );

    const streamRes = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream-proxy?ticket=${expiredTicket}`);
    assert.strictEqual(streamRes.status, 401);
    const body = await streamRes.json();
    assert.match(body.message, /expired/i);
  });

  test("8. Stream endpoints reject primary login token passed via query parameter (prevents token leak)", async () => {
    // Pass standard long-lived login token as ?ticket= (it lacks ticketType: "stream")
    const streamRes = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream-proxy?ticket=${superAdminToken}`);
    assert.strictEqual(streamRes.status, 403);
    const body = await streamRes.json();
    assert.match(body.message, /short-lived stream tickets/i);
  });

  test("9. Stream ticket cannot be used to access non-stream protected endpoints", async () => {
    const ticketRes = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream-ticket`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const { data } = await ticketRes.json();

    // Attempt to access user management with stream ticket
    const userRes = await fetch(`${baseUrl}/api/v1/users?ticket=${data.ticket}`);
    assert.strictEqual(userRes.status, 403);
    const body = await userRes.json();
    assert.match(body.message, /video stream endpoints/i);
  });

  test("10. Stream ticket issued for camera A cannot be used for camera B", async () => {
    const cameraB = await Camera.create({
      name: "Library East",
      cameraId: "CAM-STREAM-TEST-B",
      location: "Library",
      streamUrl: "http://127.0.0.1:8081/video",
      streamType: "mjpeg",
      status: "online",
      lastHeartbeat: new Date(),
    });

    const ticketRes = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}/stream-ticket`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
    });
    const { data } = await ticketRes.json();

    // Use ticket for camera A on camera B
    const streamRes = await fetch(`${baseUrl}/api/v1/cameras/${cameraB._id}/stream-proxy?ticket=${data.ticket}`);
    assert.strictEqual(streamRes.status, 403);
    const body = await streamRes.json();
    assert.match(body.message, /not authorized for this camera/i);
  });
});
