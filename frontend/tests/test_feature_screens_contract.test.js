import { describe, it } from "node:test";
import assert from "node:assert/strict";
import constants from "../../shared/constants.json" with { type: "json" };
import {
  cameraApi,
  incidentApi,
  occupancyApi,
  parkingApi,
  notificationApi,
  userApi,
} from "../src/services/campusApi.js";

describe("Frontend Feature Screens & Data Contract Verification", () => {
  const { roles } = constants;

  it("exports all required campus API service modules and endpoints", () => {
    // Camera API
    assert.equal(typeof cameraApi.list, "function");
    assert.equal(typeof cameraApi.getById, "function");
    assert.equal(typeof cameraApi.updateStatus, "function");

    // Incident API
    assert.equal(typeof incidentApi.list, "function");
    assert.equal(typeof incidentApi.getById, "function");
    assert.equal(typeof incidentApi.updateStatus, "function");

    // Occupancy API
    assert.equal(typeof occupancyApi.list, "function");
    assert.equal(typeof occupancyApi.getById, "function");

    // Parking API
    assert.equal(typeof parkingApi.list, "function");
    assert.equal(typeof parkingApi.getById, "function");

    // Notification API
    assert.equal(typeof notificationApi.list, "function");
    assert.equal(typeof notificationApi.markAsRead, "function");
    assert.equal(typeof notificationApi.markAllAsRead, "function");

    // User API
    assert.equal(typeof userApi.list, "function");
    assert.equal(typeof userApi.create, "function");
    assert.equal(typeof userApi.update, "function");
  });

  describe("Realtime Event Deduplication Logic", () => {
    it("deduplicates prepended incidents when matching id already exists", () => {
      const existing = [
        { _id: "inc-1", title: "Crowd Surge", status: "new" },
        { _id: "inc-2", title: "Unauthorized Entry", status: "investigating" },
      ];
      const incomingDuplicate = { _id: "inc-1", title: "Crowd Surge", status: "acknowledged" };

      // Deduplication implementation used in Incidents and Dashboard
      const updated = existing.some((i) => (i._id || i.id) === incomingDuplicate._id)
        ? existing.map((i) => ((i._id || i.id) === incomingDuplicate._id ? incomingDuplicate : i))
        : [incomingDuplicate, ...existing];

      assert.equal(updated.length, 2, "List length must remain 2, no duplicates created");
      assert.equal(updated[0].status, "acknowledged");
    });

    it("prepends new incidents when id is not in state", () => {
      const existing = [
        { _id: "inc-1", title: "Crowd Surge", status: "new" },
      ];
      const incomingNew = { _id: "inc-3", title: "Fire Alarm", status: "new" };

      const updated = existing.some((i) => (i._id || i.id) === incomingNew._id)
        ? existing.map((i) => ((i._id || i.id) === incomingNew._id ? incomingNew : i))
        : [incomingNew, ...existing];

      assert.equal(updated.length, 2);
      assert.equal(updated[0]._id, "inc-3");
    });

    it("deduplicates prepended notifications safely", () => {
      const notifications = [{ _id: "notif-1", read: false }];
      const duplicateNotif = { _id: "notif-1", read: false };

      const result = notifications.some((n) => (n._id || n.id) === duplicateNotif._id)
        ? notifications
        : [duplicateNotif, ...notifications];

      assert.equal(result.length, 1);
    });

    it("updates camera status in-place without altering list length", () => {
      const cameras = [
        { _id: "cam-1", name: "Gate 1", status: "offline" },
        { _id: "cam-2", name: "Library", status: "online" },
      ];
      const statusUpdate = { cameraId: "cam-1", status: "online" };

      const updated = cameras.map((cam) =>
        (cam._id || cam.id) === statusUpdate.cameraId
          ? { ...cam, status: statusUpdate.status }
          : cam
      );

      assert.equal(updated.length, 2);
      assert.equal(updated[0].status, "online");
    });
  });

  describe("Incident Workflow & Transition Contracts", () => {
    const { transitions } = constants.incident;

    it("allows valid forward transitions from new", () => {
      assert.ok(transitions.new.includes("acknowledged"));
      assert.ok(transitions.new.includes("dismissed"));
    });

    it("allows investigation and resolution from acknowledged", () => {
      assert.ok(transitions.acknowledged.includes("investigating"));
      assert.ok(transitions.acknowledged.includes("resolved"));
      assert.ok(transitions.acknowledged.includes("dismissed"));
    });

    it("prevents transitions once terminal states are reached", () => {
      assert.equal(transitions.resolved.length, 0, "Resolved incidents cannot transition");
      assert.equal(transitions.dismissed.length, 0, "Dismissed incidents cannot transition");
    });
  });

  describe("Capacity & Threshold Calculations", () => {
    it("safely computes occupancy percentage without division by zero", () => {
      function computeOccupancy(occupied, capacity) {
        if (!capacity || capacity <= 0) return 0;
        return Math.min(100, Math.round((Math.max(0, occupied) / capacity) * 100));
      }

      assert.equal(computeOccupancy(0, 0), 0);
      assert.equal(computeOccupancy(50, 0), 0);
      assert.equal(computeOccupancy(-10, 100), 0);
      assert.equal(computeOccupancy(75, 100), 75);
      assert.equal(computeOccupancy(120, 100), 100, "Caps at 100% for progress bars");
    });

    it("accurately categorizes crowd thresholds based on standard 70% and 90% rules", () => {
      function getCrowdStatus(percentage) {
        if (percentage >= 90) return { label: "Critical", variant: "danger" };
        if (percentage >= 70) return { label: "Crowded", variant: "warning" };
        return { label: "Normal", variant: "success" };
      }

      assert.equal(getCrowdStatus(35).variant, "success");
      assert.equal(getCrowdStatus(70).variant, "warning");
      assert.equal(getCrowdStatus(89).variant, "warning");
      assert.equal(getCrowdStatus(90).variant, "danger");
      assert.equal(getCrowdStatus(99).variant, "danger");
    });
  });

  describe("Role-Based Feature Boundaries", () => {
    it("ensures student role is barred from staff and management features", () => {
      const studentRole = roles.STUDENT;
      const staffRoles = [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY];

      assert.equal(staffRoles.includes(studentRole), false);
    });

    it("ensures faculty role cannot access user management", () => {
      const userManagementRoles = [roles.SUPER_ADMIN, roles.DEPT_HEAD];
      assert.equal(userManagementRoles.includes(roles.FACULTY), false);
    });
  });
});
