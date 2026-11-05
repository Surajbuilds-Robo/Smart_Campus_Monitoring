import { describe, it } from "node:test";
import assert from "node:assert/strict";
import constants from "../../shared/constants.json" with { type: "json" };

describe("Frontend Role-Aware Navigation Foundation", () => {
  const { roles } = constants;

  const navigation = [
    {
      label: "Dashboard",
      path: "/dashboard",
      roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
    },
    {
      label: "Cameras",
      path: "/cameras",
      roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY],
    },
    {
      label: "Parking",
      path: "/parking",
      roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
    },
    {
      label: "Crowd Monitoring",
      path: "/crowd",
      roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
    },
    {
      label: "Campus Resources",
      path: "/resources",
      roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
    },
    {
      label: "Incidents",
      path: "/incidents",
      roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY],
    },
    {
      label: "Notifications",
      path: "/notifications",
      roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
    },
    {
      label: "User Management",
      path: "/users",
      roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD],
    },
  ];

  function getVisibleItems(role) {
    return navigation.filter((item) => item.roles.includes(role));
  }

  it("provides SUPER_ADMIN with access to all 8 operational navigation items", () => {
    const items = getVisibleItems(roles.SUPER_ADMIN);
    assert.equal(items.length, 8);
    assert.deepEqual(
      items.map((i) => i.path),
      [
        "/dashboard",
        "/cameras",
        "/parking",
        "/crowd",
        "/resources",
        "/incidents",
        "/notifications",
        "/users",
      ]
    );
  });

  it("provides DEPT_HEAD with management and operational navigation", () => {
    const items = getVisibleItems(roles.DEPT_HEAD);
    assert.equal(items.length, 8);
    assert.ok(items.some((i) => i.path === "/users"));
    assert.ok(items.some((i) => i.path === "/cameras"));
    assert.ok(items.some((i) => i.path === "/incidents"));
  });

  it("provides FACULTY with operational features but excludes user management", () => {
    const items = getVisibleItems(roles.FACULTY);
    assert.equal(items.length, 7);
    assert.ok(items.some((i) => i.path === "/cameras"));
    assert.ok(items.some((i) => i.path === "/incidents"));
    assert.equal(
      items.some((i) => i.path === "/users"),
      false,
      "Faculty must not see user management"
    );
  });

  it("strictly confines STUDENT to public and student-facing features", () => {
    const items = getVisibleItems(roles.STUDENT);
    assert.equal(items.length, 5);
    assert.deepEqual(
      items.map((i) => i.path),
      ["/dashboard", "/parking", "/crowd", "/resources", "/notifications"]
    );
    assert.equal(
      items.some((i) => i.path === "/cameras"),
      false,
      "Students must not see camera feeds"
    );
    assert.equal(
      items.some((i) => i.path === "/incidents"),
      false,
      "Students must not see incident management"
    );
    assert.equal(
      items.some((i) => i.path === "/users"),
      false,
      "Students must not see user management"
    );
  });

  it("returns zero items for unauthenticated or invalid roles", () => {
    assert.equal(getVisibleItems("ANONYMOUS").length, 0);
    assert.equal(getVisibleItems(null).length, 0);
    assert.equal(getVisibleItems(undefined).length, 0);
  });
});
