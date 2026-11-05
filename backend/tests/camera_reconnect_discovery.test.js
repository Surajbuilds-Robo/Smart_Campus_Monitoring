const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Camera = require("../modules/cameras/camera.model");
const cameraService = require("../modules/cameras/camera.service");
const { isPrivateIPv4 } = require("../modules/cameras/subnetDiscovery");
const { checkCameraHealth } = require("../modules/cameras/cameraMonitor");

let mongod;
let mockPhoneServer;
let mockPhonePort = 0;
let mockServerResponding = true;

const mockUser = {
  _id: new mongoose.Types.ObjectId(),
  id: new mongoose.Types.ObjectId().toString(),
  role: "SUPER_ADMIN",
  departmentId: null,
};

describe("Android IP Camera Automatic Reconnect & Discovery Suite", () => {
  before(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    // Start a lightweight mock Android IP Webcam server
    mockPhoneServer = http.createServer((req, res) => {
      if (!mockServerResponding) {
        req.destroy();
        return;
      }

      if (req.url === "/video") {
        res.writeHead(200, {
          "Content-Type": "multipart/x-mixed-replace; boundary=--frame",
          Server: "Android/IPWebcam",
        });
        res.write("--frame\r\nContent-Type: image/jpeg\r\n\r\nfake-frame\r\n");
        // Keep stream open briefly
        setTimeout(() => res.end(), 100);
      } else if (req.url === "/status.json") {
        res.writeHead(200, {
          "Content-Type": "application/json",
          Server: "Android/IPWebcam",
        });
        res.end(JSON.stringify({ curfps: 30, totalframes: 100 }));
      } else {
        res.writeHead(200, { "Content-Type": "image/jpeg" });
        res.end("fake-shot");
      }
    });

    await new Promise((resolve) => {
      mockPhoneServer.listen(0, "127.0.0.1", () => {
        mockPhonePort = mockPhoneServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (mockPhoneServer) {
      await new Promise((resolve) => mockPhoneServer.close(resolve));
    }
    await mongoose.disconnect();
    if (mongod) {
      await mongod.stop();
    }
  });

  describe("1. Private Network Validation & SSRF Guard", () => {
    test("correctly identifies RFC1918 private IPv4 addresses", () => {
      assert.strictEqual(isPrivateIPv4("192.168.1.1"), true);
      assert.strictEqual(isPrivateIPv4("192.168.43.100"), true);
      assert.strictEqual(isPrivateIPv4("10.0.0.1"), true);
      assert.strictEqual(isPrivateIPv4("172.16.0.50"), true);
      assert.strictEqual(isPrivateIPv4("172.31.255.254"), true);
    });

    test("strictly rejects public, loopback, and cloud metadata addresses", () => {
      assert.strictEqual(isPrivateIPv4("127.0.0.1"), false);
      assert.strictEqual(isPrivateIPv4("169.254.169.254"), false);
      assert.strictEqual(isPrivateIPv4("8.8.8.8"), false);
      assert.strictEqual(isPrivateIPv4("1.1.1.1"), false);
      assert.strictEqual(isPrivateIPv4("0.0.0.0"), false);
      assert.strictEqual(isPrivateIPv4("255.255.255.255"), false);
      assert.strictEqual(isPrivateIPv4("not-an-ip"), false);
    });
  });

  describe("2. One-Time Registration & Duplicate Prevention", () => {
    test("creates phone camera with stable ID and default offline status", async () => {
      const camera = await cameraService.createCamera(mockUser, {
        name: "Android Phone Camera",
        cameraId: "CAM-PHONE-01",
        location: "Main Gate",
        cameraType: "ip_camera",
        streamType: "mjpeg",
        streamUrl: `http://127.0.0.1:${mockPhonePort}/video`,
        isActive: true,
      });

      assert.ok(camera._id);
      assert.strictEqual(camera.cameraId, "CAM-PHONE-01");
      assert.strictEqual(camera.status, "offline"); // Initial status is offline until verified
      assert.strictEqual(camera.autoReconnect, true);
    });

    test("strictly prevents duplicate camera registrations with same cameraId", async () => {
      await assert.rejects(
        async () => {
          await cameraService.createCamera(mockUser, {
            name: "Duplicate Phone Camera",
            cameraId: "CAM-PHONE-01",
            location: "Side Gate",
            streamUrl: `http://127.0.0.1:${mockPhonePort}/video`,
          });
        },
        {
          statusCode: 409,
          message: 'Camera ID "CAM-PHONE-01" is already registered.',
        }
      );
    });
  });

  describe("3. Automatic Health Monitoring & State Transitions", () => {
    test("verifies live stream reachability and resets failure count", async () => {
      const camera = await Camera.findOne({ cameraId: "CAM-PHONE-01" });
      mockServerResponding = true;

      const health = await checkCameraHealth(camera);
      assert.strictEqual(health.checked, true);
      assert.strictEqual(health.reachable, true);
      assert.strictEqual(camera.status, "online");
      assert.strictEqual(camera.consecutiveFailures, 0);
    });

    test("transitions to offline after 2 consecutive failures when stream stops", async () => {
      const camera = await Camera.findOne({ cameraId: "CAM-PHONE-01" });

      // Simulate phone camera stopped
      mockServerResponding = false;

      // 1st failure: increments consecutiveFailures to 1, remains online (jitter tolerance)
      const pass1 = await checkCameraHealth(camera, { timeoutMs: 300 });
      assert.strictEqual(pass1.reachable, false);
      assert.strictEqual(camera.consecutiveFailures, 1);
      assert.strictEqual(camera.status, "online");

      // 2nd failure: transitions to offline
      const pass2 = await checkCameraHealth(camera, { timeoutMs: 300 });
      assert.strictEqual(pass2.reachable, false);
      assert.strictEqual(pass2.changed, true);
      assert.strictEqual(camera.status, "offline");
    });

    test("automatically reconnects and restores online status when server restarts", async () => {
      const camera = await Camera.findOne({ cameraId: "CAM-PHONE-01" });
      assert.strictEqual(camera.status, "offline");

      // Simulate phone user pressing "Start server"
      mockServerResponding = true;

      const health = await checkCameraHealth(camera);
      assert.strictEqual(health.reachable, true);
      assert.strictEqual(health.changed, true);
      assert.strictEqual(camera.status, "online");
      assert.strictEqual(camera.consecutiveFailures, 0);
      assert.ok(camera.lastHeartbeat);
    });
  });

  describe("4. On-Demand Reconnect & Stream Diagnostics", () => {
    test("reconnectCamera triggers instant probe and updates status", async () => {
      const camera = await Camera.findOne({ cameraId: "CAM-PHONE-01" });
      const result = await cameraService.reconnectCamera(mockUser, camera._id);

      assert.strictEqual(result.cameraId, "CAM-PHONE-01");
      assert.strictEqual(result.reachable, true);
      assert.strictEqual(result.status, "online");
      assert.ok(result.latencyMs >= 0);
    });

    test("reconnectCamera reports honest failure when server is down", async () => {
      mockServerResponding = false;
      const camera = await Camera.findOne({ cameraId: "CAM-PHONE-01" });
      const result = await cameraService.reconnectCamera(mockUser, camera._id);

      assert.strictEqual(result.reachable, false);
      assert.strictEqual(result.status, "offline");
      assert.ok(result.error);
    });
  });

  describe("5. Changing Phone IP Address Handling & Announcement", () => {
    test("announcePhoneCamera rejects invalid or non-private IP addresses", async () => {
      const camera = await Camera.findOne({ cameraId: "CAM-PHONE-01" });

      await assert.rejects(
        async () => {
          await cameraService.announcePhoneCamera(mockUser, camera._id, "8.8.8.8");
        },
        {
          statusCode: 400,
          message: "Announced IP must be a valid private IPv4 address (192.168.x.x, 10.x.x.x, 172.16-31.x.x).",
        }
      );
    });

    test("getStreamInfo sanitizes URLs and exposes autoReconnect and lastSeenAt", async () => {
      const camera = await Camera.findOne({ cameraId: "CAM-PHONE-01" });
      const info = await cameraService.getStreamInfo(mockUser, camera._id);

      assert.strictEqual(info.cameraId, "CAM-PHONE-01");
      assert.strictEqual(info.autoReconnect, true);
      assert.strictEqual(info.cameraType, "ip_camera");
      assert.ok(info.proxyUrl.includes("stream-proxy"));
    });
  });
});
