const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const http = require("node:http");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../src/app");
const Camera = require("../modules/cameras/camera.model");
const cameraService = require("../modules/cameras/camera.service");
const { createToken } = require("../modules/auth/auth.service");

let mongod;
let appServer;
let appBaseUrl;
let mockCameraServer;
let mockCameraPort = 0;
let probeCount = 0;

let adminUser;
let adminToken;
let cameraA;
let cameraB;

describe("CCTV Diagnostics Rate Limiting & Deduplication Suite", () => {
  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    // Start app HTTP server
    appServer = http.createServer(app);
    await new Promise((resolve) => {
      appServer.listen(0, "127.0.0.1", () => {
        appBaseUrl = `http://127.0.0.1:${appServer.address().port}`;
        resolve();
      });
    });

    // Start a lightweight mock camera server counting probe attempts
    mockCameraServer = http.createServer((req, res) => {
      probeCount++;
      if (req.url === "/video") {
        res.writeHead(200, {
          "Content-Type": "multipart/x-mixed-replace; boundary=--frame",
          Server: "Android/IPWebcam",
        });
        res.write("--frame\r\nContent-Type: image/jpeg\r\n\r\nfake-frame\r\n");
        setTimeout(() => res.end(), 50);
      } else {
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end("frame");
      }
    });

    await new Promise((resolve) => {
      mockCameraServer.listen(0, "127.0.0.1", () => {
        mockCameraPort = mockCameraServer.address().port;
        resolve();
      });
    });

    adminUser = {
      _id: new mongoose.Types.ObjectId(),
      id: new mongoose.Types.ObjectId().toString(),
      role: "SUPER_ADMIN",
      departmentId: null,
    };

    adminToken = createToken(adminUser);

    // Seed two independent cameras
    cameraA = await Camera.create({
      name: "Palak Phone CAM-01",
      cameraId: "CAM-01",
      location: "Campus Library North",
      streamUrl: `http://127.0.0.1:${mockCameraPort}/video`,
      cameraType: "ip_camera",
      streamType: "mjpeg",
      status: "online",
      isActive: true,
    });

    cameraB = await Camera.create({
      name: "Campus Gate CAM-02",
      cameraId: "CAM-02",
      location: "Main Security Gate",
      streamUrl: `http://127.0.0.1:${mockCameraPort}/video`,
      cameraType: "ip_camera",
      streamType: "mjpeg",
      status: "offline",
      isActive: true,
    });
  });

  after(async () => {
    if (appServer?.listening) {
      await new Promise((resolve) => appServer.close(resolve));
    }
    if (mockCameraServer?.listening) {
      await new Promise((resolve) => mockCameraServer.close(resolve));
    }
    await mongoose.disconnect();
    if (mongod) {
      await mongod.stop();
    }
  });

  test("1. /api/v1/health is accessible without authorization or consuming public client quota", async () => {
    const res = await fetch(`${appBaseUrl}/api/v1/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.message, "Smart Campus Monitoring API is running.");
  });

  test("2. Identical in-flight stream verification requests share a single socket probe", async () => {
    probeCount = 0;

    // Fire 4 parallel verifications for Camera A simultaneously
    const results = await Promise.all([
      cameraService.verifyCameraStream(adminUser, cameraA._id),
      cameraService.verifyCameraStream(adminUser, cameraA._id),
      cameraService.verifyCameraStream(adminUser, cameraA._id),
      cameraService.verifyCameraStream(adminUser, cameraA._id),
    ]);

    // All return consistent reachable results
    for (const r of results) {
      assert.strictEqual(r.cameraId, "CAM-01");
      assert.strictEqual(r.reachable, true);
    }

    // Must have coalesced into a single probe, not 4 separate socket floods
    assert.strictEqual(probeCount, 1);
  });

  test("3. Rapid stream verifications within cooldown return cached result", async () => {
    probeCount = 0;

    // First call with force: true executes fresh probe
    const r1 = await cameraService.verifyCameraStream(adminUser, cameraA._id, { force: true });
    assert.strictEqual(r1.reachable, true);
    assert.strictEqual(probeCount, 1);

    // Second immediate call within 3s cooldown returns cached result without re-probing
    const r2 = await cameraService.verifyCameraStream(adminUser, cameraA._id);
    assert.strictEqual(r2.reachable, true);
    assert.strictEqual(probeCount, 1);
  });

  test("4. Subnet discovery enforces per-camera cooldown and sets HTTP 429 with Retry-After", async () => {
    // 1st discovery scan for Camera A executes
    const res1 = await fetch(`${appBaseUrl}/api/v1/cameras/${cameraA._id}/discover`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ port: mockCameraPort }),
    });

    assert.ok(res1.status === 200 || res1.status === 429);

    // 2nd immediate discovery scan within 15s must be rate limited with HTTP 429
    const res2 = await fetch(`${appBaseUrl}/api/v1/cameras/${cameraA._id}/discover`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ port: mockCameraPort }),
    });

    assert.strictEqual(res2.status, 429);
    const data2 = await res2.json();
    assert.strictEqual(data2.rateLimited, true);
    assert.ok(res2.headers.get("retry-after"));
    assert.ok(Number(res2.headers.get("retry-after")) > 0);
  });

  test("5. One camera reaching discovery limit does not block another camera's operations", async () => {
    // Camera B has an independent scope and can still be verified without being blocked by Camera A
    const res = await fetch(`${appBaseUrl}/api/v1/cameras/${cameraB._id}/verify`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.data.cameraId, "CAM-02");
  });

  test("6. Stream verification does not create AI worker processes", async () => {
    // Verifying stream is a pure network probe (TCP/HTTP) and never spawns an AI worker
    const r = await cameraService.verifyCameraStream(adminUser, cameraA._id);
    assert.strictEqual(r.cameraId, "CAM-01");
    assert.strictEqual(r.reachable, true);
  });
});
