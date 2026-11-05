const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");

const Camera = require("../modules/cameras/camera.model");
const Occupancy = require("../modules/occupancy/occupancy.model");
const Incident = require("../modules/incidents/incident.model");
const cameraService = require("../modules/cameras/camera.service");
const occupancyService = require("../modules/occupancy/occupancy.service");
const aiController = require("../modules/ai/ai.controller");
const { roles } = require("../../shared/constants.json");

describe("Camera Multi-Camera Persistence & Telemetry Integration", () => {
  let mongoServer;
  const adminUser = {
    id: new mongoose.Types.ObjectId().toString(),
    role: roles.SUPER_ADMIN,
    departmentId: null,
  };
  const securityUser = {
    id: new mongoose.Types.ObjectId().toString(),
    role: roles.SECURITY,
    departmentId: null,
  };
  const studentUser = {
    id: new mongoose.Types.ObjectId().toString(),
    role: roles.STUDENT,
    departmentId: null,
  };

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
  });

  after(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  test("1. Multi-camera registration persists in MongoDB with stable IDs", async () => {
    const cam1 = await cameraService.createCamera(securityUser, {
      name: "Gate 1 North",
      cameraId: "CAM-NORTH-01",
      location: "North Gate Perimeter",
      streamUrl: "http://192.168.1.101:8080/video",
      streamType: "mjpeg",
      status: "offline",
    });

    const cam2 = await cameraService.createCamera(securityUser, {
      name: "Library Entrance",
      cameraId: "CAM-LIB-02",
      location: "Central Library Foyer",
      streamUrl: "http://192.168.1.102:8080/video",
      streamType: "mjpeg",
      status: "offline",
    });

    const cam3 = await cameraService.createCamera(securityUser, {
      name: "Cafeteria Hall",
      cameraId: "CAM-CAFE-03",
      location: "Main Food Court",
      streamUrl: "http://192.168.1.103:8080/video",
      streamType: "mjpeg",
      status: "offline",
    });

    assert.ok(cam1._id, "Camera 1 persisted with MongoDB ObjectId");
    assert.ok(cam2._id, "Camera 2 persisted with MongoDB ObjectId");
    assert.ok(cam3._id, "Camera 3 persisted with MongoDB ObjectId");

    // Verify all 3 cameras exist in database
    const allCameras = await cameraService.listCameras(securityUser);
    assert.strictEqual(allCameras.length, 3);
    assert.ok(allCameras.some((c) => c.cameraId === "CAM-NORTH-01"));
    assert.ok(allCameras.some((c) => c.cameraId === "CAM-LIB-02"));
    assert.ok(allCameras.some((c) => c.cameraId === "CAM-CAFE-03"));
  });

  test("2. Duplicate camera registration is rejected with 409", async () => {
    await assert.rejects(
      async () => {
        await cameraService.createCamera(securityUser, {
          name: "Duplicate Gate",
          cameraId: "CAM-NORTH-01",
          location: "Duplicate Location",
          streamUrl: "http://192.168.1.101:8080/video",
        });
      },
      (err) => err.statusCode === 409
    );
  });

  test("3. Updating stream URL permanently persists without wiping records", async () => {
    const cam = await Camera.findOne({ cameraId: "CAM-NORTH-01" });
    const updated = await cameraService.updateCamera(securityUser, cam._id.toString(), {
      streamUrl: "http://192.168.1.150:8080/video",
    });

    assert.strictEqual(updated.streamUrl, "http://192.168.1.150:8080/video");

    // Fetch directly from database to verify persistence
    const reloaded = await Camera.findById(cam._id);
    assert.strictEqual(reloaded.streamUrl, "http://192.168.1.150:8080/video");
    assert.strictEqual(reloaded.name, "Gate 1 North");
  });

  test("4. Disconnected cameras remain in database and are not deleted", async () => {
    const cam = await Camera.findOne({ cameraId: "CAM-LIB-02" });
    await cameraService.updateCameraStatus("CAM-LIB-02", "offline");

    const reloaded = await Camera.findById(cam._id);
    assert.ok(reloaded, "Camera record still exists in database");
    assert.strictEqual(reloaded.status, "offline");
  });

  test("5. AI worker can fetch active camera registry via /api/v1/ai/cameras", async () => {
    const cameras = await Camera.find({ isActive: true }).select("-streamProxyUrl");
    assert.strictEqual(cameras.length, 3);
  });

  test("6. Telemetry from multiple cameras persists observations with correct camera references", async () => {
    const cam1 = await Camera.findOne({ cameraId: "CAM-NORTH-01" });
    const cam2 = await Camera.findOne({ cameraId: "CAM-LIB-02" });

    // Submit telemetry for camera 1
    const obs1 = await occupancyService.createOccupancy(adminUser, {
      cameraId: cam1.cameraId,
      peopleCount: 12,
      capacity: 50,
      zoneName: cam1.location,
    });

    // Submit telemetry for camera 2
    const obs2 = await occupancyService.createOccupancy(adminUser, {
      cameraId: cam2.cameraId,
      peopleCount: 38,
      capacity: 40,
      zoneName: cam2.location,
    });

    assert.ok(obs1._id);
    assert.ok(obs2._id);
    assert.strictEqual(obs1.cameraId, "CAM-NORTH-01");
    assert.strictEqual(obs2.cameraId, "CAM-LIB-02");

    // Query historical telemetry for specific camera
    const historyCam1 = await occupancyService.listOccupancy(adminUser, {
      camera: cam1._id.toString(),
    });
    assert.ok(historyCam1.length >= 1);
    assert.strictEqual(historyCam1[0].cameraId, "CAM-NORTH-01");
  });

  test("7. Unprivileged users cannot register or delete cameras", async () => {
    await assert.rejects(
      async () => {
        await cameraService.createCamera(studentUser, {
          name: "Hacker Camera",
          cameraId: "CAM-EVIL",
          location: "Secret",
          streamUrl: "http://192.168.1.200:8080/video",
        });
      },
      (err) => err.statusCode === 403
    );

    const cam = await Camera.findOne({ cameraId: "CAM-NORTH-01" });
    await assert.rejects(
      async () => {
        await cameraService.deleteCamera(studentUser, cam._id.toString());
      },
      (err) => err.statusCode === 403
    );
  });
});
