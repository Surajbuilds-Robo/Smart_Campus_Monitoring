const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const jwt = require("jsonwebtoken");

const {
  initializeSocketServer,
  getSocketServer,
  closeSocketServer,
} = require("../src/realtime/socketServer");
const socketAuth = require("../src/realtime/socketAuth");
const {
  userRoom,
  departmentRoom,
  roleRoom,
  getAuthorizedRooms,
  isRoomAuthorized,
  joinAuthorizedRooms,
} = require("../src/realtime/socketRooms");
const {
  initializePublisher,
  publishToUser,
  publishToDepartment,
  publishToRole,
  publishIncidentCreated,
  publishIncidentUpdated,
  publishCameraStatus,
  publishOccupancyUpdate,
  publishParkingUpdate,
  publishNotification,
} = require("../src/realtime/eventPublisher");
const { roles, socketEvents } = require("../../shared/constants.json");

describe("Socket.IO Realtime Suite", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testSecret = "0123456789abcdef0123456789abcdef"; // 32 chars
  let server;

  before(() => {
    process.env.JWT_SECRET = testSecret;
    server = http.createServer();
  });

  after(() => {
    process.env.JWT_SECRET = originalSecret;
    closeSocketServer();
    if (server?.listening) {
      server.close();
    }
  });

  describe("Server Lifecycle & Duplicate Prevention", () => {
    test("initializeSocketServer returns singleton and prevents duplicate server instances", () => {
      const io1 = initializeSocketServer(server);
      assert.ok(io1);
      assert.strictEqual(typeof io1.on, "function");

      const io2 = initializeSocketServer(server);
      assert.strictEqual(io1, io2, "Should return existing server instance");
      assert.strictEqual(getSocketServer(), io1);
    });

    test("closeSocketServer cleans up socket instance safely", () => {
      closeSocketServer();
      assert.strictEqual(getSocketServer(), null);

      // Re-initialize for subsequent tests
      initializeSocketServer(server);
    });
  });

  describe("Socket Authentication Middleware (socketAuth)", () => {
    test("accepts valid JWT from handshake auth and populates socket.user", () => {
      const token = jwt.sign(
        { role: roles.DEPT_HEAD, departmentId: "dept-cs-1" },
        testSecret,
        { subject: "user-dept-1", algorithm: "HS256" }
      );

      const mockSocket = {
        handshake: {
          auth: { token },
          headers: {},
        },
      };

      let nextError = null;
      socketAuth(mockSocket, (err) => {
        nextError = err;
      });

      assert.strictEqual(nextError, undefined);
      assert.deepStrictEqual(mockSocket.user, {
        id: "user-dept-1",
        role: roles.DEPT_HEAD,
        departmentId: "dept-cs-1",
      });
    });

    test("accepts valid JWT from handshake authorization header", () => {
      const token = jwt.sign(
        { role: roles.FACULTY, departmentId: "dept-ee-2" },
        testSecret,
        { subject: "faculty-42", algorithm: "HS256" }
      );

      const mockSocket = {
        handshake: {
          auth: {},
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      };

      let nextError = null;
      socketAuth(mockSocket, (err) => {
        nextError = err;
      });

      assert.strictEqual(nextError, undefined);
      assert.strictEqual(mockSocket.user.id, "faculty-42");
      assert.strictEqual(mockSocket.user.role, roles.FACULTY);
    });

    test("rejects missing token with error", () => {
      const mockSocket = {
        handshake: {
          auth: {},
          headers: {},
        },
      };

      let nextError = null;
      socketAuth(mockSocket, (err) => {
        nextError = err;
      });

      assert.ok(nextError instanceof Error);
      assert.strictEqual(nextError.message, "Authentication token is required.");
    });

    test("rejects expired token with specific expiration error", () => {
      const expiredToken = jwt.sign(
        { role: roles.STUDENT },
        testSecret,
        { subject: "student-1", algorithm: "HS256", expiresIn: "-1s" }
      );

      const mockSocket = {
        handshake: {
          auth: { token: expiredToken },
          headers: {},
        },
      };

      let nextError = null;
      socketAuth(mockSocket, (err) => {
        nextError = err;
      });

      assert.ok(nextError instanceof Error);
      assert.strictEqual(nextError.message, "Authentication token has expired.");
    });

    test("rejects token with invalid signature", () => {
      const badToken = jwt.sign(
        { role: roles.STUDENT },
        "wrong-secret-0123456789abcdef01234567",
        { subject: "student-1", algorithm: "HS256" }
      );

      const mockSocket = {
        handshake: {
          auth: { token: badToken },
          headers: {},
        },
      };

      let nextError = null;
      socketAuth(mockSocket, (err) => {
        nextError = err;
      });

      assert.ok(nextError instanceof Error);
      assert.strictEqual(nextError.message, "Invalid authentication token.");
    });

    test("rejects token with unlisted/invalid role claim", () => {
      const bogusRoleToken = jwt.sign(
        { role: "UNAUTHORIZED_ROLE" },
        testSecret,
        { subject: "intruder-1", algorithm: "HS256" }
      );

      const mockSocket = {
        handshake: {
          auth: { token: bogusRoleToken },
          headers: {},
        },
      };

      let nextError = null;
      socketAuth(mockSocket, (err) => {
        nextError = err;
      });

      assert.ok(nextError instanceof Error);
      assert.strictEqual(nextError.message, "Invalid authentication token.");
    });
  });

  describe("Room Authorization & Boundary Enforcement (socketRooms)", () => {
    test("SUPER_ADMIN authorized rooms include user, role, and system global", () => {
      const user = { id: "admin-1", role: roles.SUPER_ADMIN };
      const rooms = getAuthorizedRooms(user);

      assert.ok(rooms.includes("user:admin-1"));
      assert.ok(rooms.includes("role:SUPER_ADMIN"));
      assert.ok(rooms.includes("system:global"));
    });

    test("DEPT_HEAD authorized rooms include department room but not other departments", () => {
      const user = { id: "dept-head-1", role: roles.DEPT_HEAD, departmentId: "dept-cs" };
      const rooms = getAuthorizedRooms(user);

      assert.ok(rooms.includes("user:dept-head-1"));
      assert.ok(rooms.includes("role:DEPT_HEAD"));
      assert.ok(rooms.includes("department:dept-cs"));
      assert.strictEqual(rooms.includes("department:dept-other"), false);
      assert.strictEqual(rooms.includes("system:global"), false);
    });

    test("STUDENT is strictly confined to user room and student role room", () => {
      const user = { id: "student-1", role: roles.STUDENT, departmentId: "dept-cs" };
      const rooms = getAuthorizedRooms(user);

      assert.ok(rooms.includes("user:student-1"));
      assert.ok(rooms.includes("role:STUDENT"));
      assert.strictEqual(rooms.includes("department:dept-cs"), false, "Students must not join department rooms");
      assert.strictEqual(rooms.includes("role:SUPER_ADMIN"), false);
      assert.strictEqual(rooms.includes("system:global"), false);
    });

    test("isRoomAuthorized verifies room permissions accurately", () => {
      const student = { id: "student-2", role: roles.STUDENT };
      assert.strictEqual(isRoomAuthorized(student, "user:student-2"), true);
      assert.strictEqual(isRoomAuthorized(student, "role:STUDENT"), true);
      assert.strictEqual(isRoomAuthorized(student, "role:SUPER_ADMIN"), false);
      assert.strictEqual(isRoomAuthorized(student, "department:dept-cs"), false);

      const deptHead = { id: "dh-1", role: roles.DEPT_HEAD, departmentId: "dept-cs" };
      assert.strictEqual(isRoomAuthorized(deptHead, "department:dept-cs"), true);
      assert.strictEqual(isRoomAuthorized(deptHead, "department:dept-math"), false);
    });

    test("joinAuthorizedRooms joins all authorized rooms without duplicates", async () => {
      const joined = [];
      const mockSocket = {
        user: { id: "faculty-1", role: roles.FACULTY, departmentId: "dept-bio" },
        async join(room) {
          joined.push(room);
        },
      };

      const rooms = await joinAuthorizedRooms(mockSocket);
      assert.strictEqual(rooms.length, 3);
      assert.deepStrictEqual(joined, ["user:faculty-1", "role:FACULTY", "department:dept-bio"]);
    });
  });

  describe("Event Publisher Suite (eventPublisher)", () => {
    let emittedEvents = [];
    let mockIO;

    before(() => {
      emittedEvents = [];
      mockIO = {
        to(targetRoom) {
          return {
            emit(eventName, payload) {
              emittedEvents.push({ targetRoom, eventName, payload });
            },
          };
        },
        emit(eventName, payload) {
          emittedEvents.push({ targetRoom: "broadcast:all", eventName, payload });
        },
      };

      initializePublisher(mockIO);
    });

    after(() => {
      closeSocketServer();
    });

    test("publishIncidentCreated routes to department and SUPER_ADMIN with sanitized payload", () => {
      emittedEvents = [];
      const mockIncident = {
        _id: "660c11112222333344445555",
        incidentId: "inc-101",
        eventType: "crowd_overcrowding",
        severity: "critical",
        status: "new",
        camera: "cam-gate-1",
        departmentId: "dept-cs",
        createdAt: new Date(),
      };

      const success = publishIncidentCreated(mockIncident);
      assert.strictEqual(success, true);
      assert.ok(emittedEvents.length >= 2);

      const deptEmit = emittedEvents.find((e) => e.targetRoom === "department:dept-cs");
      assert.ok(deptEmit);
      assert.strictEqual(deptEmit.eventName, socketEvents.incidentCreated);
      assert.strictEqual(deptEmit.payload.incidentId, "inc-101");
      assert.strictEqual(deptEmit.payload.password, undefined);

      const adminEmit = emittedEvents.find((e) => e.targetRoom === "role:SUPER_ADMIN");
      assert.ok(adminEmit);

      const securityEmit = emittedEvents.find((e) => e.targetRoom === "role:SECURITY");
      assert.ok(securityEmit);
    });

    test("publishIncidentUpdated routes status updates with safe payload", () => {
      emittedEvents = [];
      const mockIncident = {
        _id: "660c11112222333344445555",
        incidentId: "inc-101",
        eventType: "crowd_overcrowding",
        severity: "critical",
        status: "investigating",
        assignedTo: "staff-99",
        departmentId: "dept-cs",
        updatedAt: new Date(),
      };

      const success = publishIncidentUpdated(mockIncident);
      assert.strictEqual(success, true);
      assert.ok(emittedEvents.length >= 2);

      const deptEmit = emittedEvents.find((e) => e.targetRoom === "department:dept-cs");
      assert.strictEqual(deptEmit.eventName, socketEvents.incidentUpdated);
      assert.strictEqual(deptEmit.payload.status, "investigating");
    });

    test("publishCameraStatus routes camera status to department and SUPER_ADMIN", () => {
      emittedEvents = [];
      const mockCamera = {
        _id: "cam-id-1",
        cameraId: "CAM-01",
        status: "maintenance",
        departmentId: "dept-cs",
        lastHeartbeat: new Date(),
      };

      const success = publishCameraStatus(mockCamera);
      assert.strictEqual(success, true);

      const deptEmit = emittedEvents.find((e) => e.targetRoom === "department:dept-cs");
      assert.strictEqual(deptEmit.eventName, socketEvents.cameraStatus);
      assert.strictEqual(deptEmit.payload.status, "maintenance");
    });

    test("publishOccupancyUpdate sends sanitized availability to students for public zones", () => {
      emittedEvents = [];
      const publicRecord = {
        _id: "occ-1",
        cameraId: "CAM-LIB",
        zoneName: "Central Library",
        peopleCount: 45,
        capacity: 100,
        occupancyRatio: 0.45,
        level: "normal",
        observedAt: new Date(),
        departmentId: null, // Public zone
      };

      const success = publishOccupancyUpdate(publicRecord);
      assert.strictEqual(success, true);

      const studentEmit = emittedEvents.find((e) => e.targetRoom === "role:STUDENT");
      assert.ok(studentEmit);
      assert.strictEqual(studentEmit.eventName, socketEvents.occupancyUpdated);
      assert.strictEqual(studentEmit.payload.zoneName, "Central Library");
      assert.strictEqual(studentEmit.payload.cameraId, undefined, "Internal camera ID stripped for students");
    });

    test("publishParkingUpdate broadcasts space availability to all connected campus users", () => {
      emittedEvents = [];
      const mockParking = {
        _id: "park-1",
        zoneId: "ZONE-A",
        name: "North Lot",
        location: "Gate 2",
        totalSpaces: 100,
        occupiedSpaces: 75,
        availableSpaces: 25,
        status: "available",
        lastUpdatedAt: new Date(),
      };

      const success = publishParkingUpdate(mockParking);
      assert.strictEqual(success, true);

      const broadcast = emittedEvents.find((e) => e.targetRoom === "broadcast:all");
      assert.ok(broadcast);
      assert.strictEqual(broadcast.eventName, socketEvents.parkingUpdated);
      assert.strictEqual(broadcast.payload.availableSpaces, 25);
    });

    test("publishNotification delivers strictly to private recipient user room", () => {
      emittedEvents = [];
      const mockNotification = {
        _id: "notif-1",
        recipient: "user-target-777",
        type: "incident_assigned",
        title: "Assignment Alert",
        message: "You have been assigned to an incident.",
        readAt: null,
        createdAt: new Date(),
      };

      const success = publishNotification(mockNotification);
      assert.strictEqual(success, true);
      assert.strictEqual(emittedEvents.length, 1);
      assert.strictEqual(emittedEvents[0].targetRoom, "user:user-target-777");
      assert.strictEqual(emittedEvents[0].eventName, socketEvents.notificationCreated);
    });

    test("event publishers return false safely when publisher is uninitialized", () => {
      initializePublisher(null);
      assert.strictEqual(publishIncidentCreated({}), false);
      assert.strictEqual(publishCameraStatus({}), false);
      assert.strictEqual(publishParkingUpdate({}), false);
      assert.strictEqual(publishNotification({}), false);
    });
  });
});
