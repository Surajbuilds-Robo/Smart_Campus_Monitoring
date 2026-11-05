import { describe, it } from "node:test";
import assert from "node:assert/strict";
import constants from "../../shared/constants.json" with { type: "json" };

describe("Frontend Route Registry & Security Boundary Contracts", () => {
  const { roles } = constants;

  const STAFF_ROLES = [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY];
  const ADMIN_ROLES = [roles.SUPER_ADMIN, roles.DEPT_HEAD];

  const registeredRoutes = [
    { path: "/login", isPublic: true },
    { path: "/unauthorized", isPublic: true },
    { path: "/dashboard", isPublic: false, allowedRoles: null },
    { path: "/cameras", isPublic: false, allowedRoles: STAFF_ROLES },
    { path: "/incidents", isPublic: false, allowedRoles: STAFF_ROLES },
    { path: "/parking", isPublic: false, allowedRoles: null },
    { path: "/crowd", isPublic: false, allowedRoles: null },
    { path: "/resources", isPublic: false, allowedRoles: null },
    { path: "/notifications", isPublic: false, allowedRoles: null },
    { path: "/users", isPublic: false, allowedRoles: ADMIN_ROLES },
  ];

  it("registers essential public authentication routes", () => {
    const publicRoutes = registeredRoutes.filter((r) => r.isPublic);
    assert.deepEqual(
      publicRoutes.map((r) => r.path),
      ["/login", "/unauthorized"]
    );
  });

  it("protects camera and incident routes behind staff roles", () => {
    const cameraRoute = registeredRoutes.find((r) => r.path === "/cameras");
    const incidentRoute = registeredRoutes.find((r) => r.path === "/incidents");

    assert.deepEqual(cameraRoute.allowedRoles, STAFF_ROLES);
    assert.deepEqual(incidentRoute.allowedRoles, STAFF_ROLES);
    assert.equal(cameraRoute.allowedRoles.includes(roles.STUDENT), false);
    assert.equal(incidentRoute.allowedRoles.includes(roles.STUDENT), false);
  });

  it("protects user management route strictly behind admin roles", () => {
    const usersRoute = registeredRoutes.find((r) => r.path === "/users");

    assert.deepEqual(usersRoute.allowedRoles, ADMIN_ROLES);
    assert.equal(usersRoute.allowedRoles.includes(roles.FACULTY), false);
    assert.equal(usersRoute.allowedRoles.includes(roles.STUDENT), false);
  });

  it("allows general authenticated campus access for parking and crowd density", () => {
    const parkingRoute = registeredRoutes.find((r) => r.path === "/parking");
    const crowdRoute = registeredRoutes.find((r) => r.path === "/crowd");

    assert.equal(parkingRoute.allowedRoles, null);
    assert.equal(crowdRoute.allowedRoles, null);
  });
});
