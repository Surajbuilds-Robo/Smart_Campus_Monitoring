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

function makeToken(user) {
  return createToken(user);
}

describe("Phase 2 — Camera Management Role Boundaries Suite", () => {
  let superAdminUser, superAdminToken;
  let securityUser, securityToken;
  let deptHeadUser, deptHeadToken;
  let facultyUser, facultyToken;
  let studentUser, studentToken;
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

    const engineeringDeptId = new mongoose.Types.ObjectId();

    // Create users for each role
    superAdminUser = await User.create({
      name: "Super Admin",
      email: "superadmin_test@campus.edu",
      passwordHash: "hash",
      role: roles.SUPER_ADMIN,
    });
    superAdminToken = makeToken(superAdminUser);

    securityUser = await User.create({
      name: "Security Officer",
      email: "security_test@campus.edu",
      passwordHash: "hash",
      role: roles.SECURITY,
    });
    securityToken = makeToken(securityUser);

    deptHeadUser = await User.create({
      name: "Dept Head",
      email: "depthead_test@campus.edu",
      passwordHash: "hash",
      role: roles.DEPT_HEAD,
      departmentId: engineeringDeptId,
    });
    deptHeadToken = makeToken(deptHeadUser);

    facultyUser = await User.create({
      name: "Faculty Member",
      email: "faculty_test@campus.edu",
      passwordHash: "hash",
      role: roles.FACULTY,
      departmentId: engineeringDeptId,
    });
    facultyToken = makeToken(facultyUser);

    studentUser = await User.create({
      name: "Student",
      email: "student_test@campus.edu",
      passwordHash: "hash",
      role: roles.STUDENT,
    });
    studentToken = makeToken(studentUser);

    testCamera = await Camera.create({
      name: "Main Quad Camera",
      cameraId: "CAM-QUAD-01",
      location: "Main Quad",
      building: "Administration",
      status: "offline",
      streamUrl: "http://10.112.164.88:8080/video",
      isActive: true,
      departmentId: engineeringDeptId,
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

  describe("1. SUPER_ADMIN Permissions", () => {
    test("SUPER_ADMIN can register a new camera (POST /api/v1/cameras)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          name: "Admin Registered Camera",
          cameraId: "CAM-ADMIN-01",
          location: "North Gate",
          streamUrl: "http://10.112.164.88:8080/video",
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.camera.cameraId, "CAM-ADMIN-01");
    });

    test("SUPER_ADMIN can update and disable a camera (PATCH /api/v1/cameras/:id)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${superAdminToken}`,
        },
        body: JSON.stringify({
          name: "Updated Quad Camera",
          isActive: false,
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.data.camera.name, "Updated Quad Camera");
      assert.strictEqual(data.data.camera.isActive, false);
    });

    test("SUPER_ADMIN can delete/unregister a camera (DELETE /api/v1/cameras/:id)", async () => {
      const toDelete = await Camera.create({
        name: "Temporary Camera",
        cameraId: "CAM-TMP-01",
        location: "Hallway",
        isActive: true,
      });

      const res = await fetch(`${baseUrl}/api/v1/cameras/${toDelete._id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${superAdminToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);

      const found = await Camera.findById(toDelete._id);
      assert.strictEqual(found, null);
    });
  });

  describe("2. SECURITY Role Permissions", () => {
    test("SECURITY can register a new camera (POST /api/v1/cameras)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${securityToken}`,
        },
        body: JSON.stringify({
          name: "Security Registered Camera",
          cameraId: "CAM-SEC-01",
          location: "Security Post A",
          streamUrl: "http://10.112.164.88:8080/video",
        }),
      });

      assert.strictEqual(res.status, 201);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.data.camera.cameraId, "CAM-SEC-01");
    });

    test("SECURITY can update and configure a camera (PATCH /api/v1/cameras/:id)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${securityToken}`,
        },
        body: JSON.stringify({
          location: "Security Patrol Zone",
          isActive: true,
        }),
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.data.camera.location, "Security Patrol Zone");
    });

    test("SECURITY can delete a camera (DELETE /api/v1/cameras/:id)", async () => {
      const toDelete = await Camera.create({
        name: "Security Temp Camera",
        cameraId: "CAM-SEC-TMP",
        location: "Perimeter",
        isActive: true,
      });

      const res = await fetch(`${baseUrl}/api/v1/cameras/${toDelete._id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${securityToken}`,
        },
      });

      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
    });
  });

  describe("3. DEPT_HEAD Role Boundary (View-Only, Denied Management)", () => {
    test("DEPT_HEAD can view cameras (GET /api/v1/cameras)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        headers: { Authorization: `Bearer ${deptHeadToken}` },
      });
      assert.strictEqual(res.status, 200);
    });

    test("DEPT_HEAD cannot register a camera (POST /api/v1/cameras -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deptHeadToken}`,
        },
        body: JSON.stringify({
          name: "Unauthorized Camera",
          cameraId: "CAM-UNAUTH-01",
          location: "Engineering",
          streamUrl: "http://10.112.164.88:8080/video",
        }),
      });

      assert.strictEqual(res.status, 403);
    });

    test("DEPT_HEAD cannot edit a camera (PATCH /api/v1/cameras/:id -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deptHeadToken}`,
        },
        body: JSON.stringify({ name: "Hacked Camera Name" }),
      });

      assert.strictEqual(res.status, 403);
    });

    test("DEPT_HEAD cannot delete a camera (DELETE /api/v1/cameras/:id -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${deptHeadToken}` },
      });

      assert.strictEqual(res.status, 403);
    });

    test("DEPT_HEAD cannot verify stream endpoint (POST /api/v1/cameras/verify-stream -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras/verify-stream`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${deptHeadToken}`,
        },
        body: JSON.stringify({ streamUrl: "http://10.112.164.88:8080/video" }),
      });

      assert.strictEqual(res.status, 403);
    });
  });

  describe("4. FACULTY Role Boundary (View-Only, Denied Management)", () => {
    test("FACULTY can view authorized cameras (GET /api/v1/cameras)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        headers: { Authorization: `Bearer ${facultyToken}` },
      });
      assert.strictEqual(res.status, 200);
    });

    test("FACULTY cannot register a camera (POST /api/v1/cameras -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${facultyToken}`,
        },
        body: JSON.stringify({
          name: "Faculty Camera",
          cameraId: "CAM-FAC-01",
          location: "Lab",
        }),
      });

      assert.strictEqual(res.status, 403);
    });

    test("FACULTY cannot edit a camera (PATCH /api/v1/cameras/:id -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${facultyToken}`,
        },
        body: JSON.stringify({ name: "Faculty Changed Name" }),
      });

      assert.strictEqual(res.status, 403);
    });

    test("FACULTY cannot delete a camera (DELETE /api/v1/cameras/:id -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${facultyToken}` },
      });

      assert.strictEqual(res.status, 403);
    });
  });

  describe("5. STUDENT Role Boundary (Strictly Barred From Cameras)", () => {
    test("STUDENT cannot view cameras (GET /api/v1/cameras -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 403);
    });

    test("STUDENT cannot register cameras (POST /api/v1/cameras -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${studentToken}`,
        },
        body: JSON.stringify({
          name: "Student Phone",
          cameraId: "CAM-STU-01",
        }),
      });
      assert.strictEqual(res.status, 403);
    });

    test("STUDENT cannot delete cameras (DELETE /api/v1/cameras/:id -> 403)", async () => {
      const res = await fetch(`${baseUrl}/api/v1/cameras/${testCamera._id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert.strictEqual(res.status, 403);
    });
  });
});
