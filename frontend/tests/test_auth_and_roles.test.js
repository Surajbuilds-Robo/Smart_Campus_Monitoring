import { describe, it } from "node:test";
import assert from "node:assert/strict";
import constants from "../../shared/constants.json" with { type: "json" };

describe("Frontend Auth & Role Foundation", () => {
  const { roles } = constants;

  const STAFF_ROLES = [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY];
  const ADMIN_ROLES = [roles.SUPER_ADMIN, roles.DEPT_HEAD];

  it("verifies established roles match constants contract", () => {
    assert.equal(roles.SUPER_ADMIN, "SUPER_ADMIN");
    assert.equal(roles.SECURITY, "SECURITY");
    assert.equal(roles.DEPT_HEAD, "DEPT_HEAD");
    assert.equal(roles.FACULTY, "FACULTY");
    assert.equal(roles.STUDENT, "STUDENT");
    assert.equal(Object.keys(roles).length, 5);
  });

  it("evaluates staff permissions accurately", () => {
    const isStaff = (role) => STAFF_ROLES.includes(role);

    assert.equal(isStaff(roles.SUPER_ADMIN), true);
    assert.equal(isStaff(roles.DEPT_HEAD), true);
    assert.equal(isStaff(roles.FACULTY), true);
    assert.equal(isStaff(roles.STUDENT), false);
    assert.equal(isStaff("GUEST"), false);
    assert.equal(isStaff(null), false);
  });

  it("evaluates admin permissions accurately", () => {
    const isAdmin = (role) => ADMIN_ROLES.includes(role);

    assert.equal(isAdmin(roles.SUPER_ADMIN), true);
    assert.equal(isAdmin(roles.DEPT_HEAD), true);
    assert.equal(isAdmin(roles.FACULTY), false);
    assert.equal(isAdmin(roles.STUDENT), false);
  });

  it("confines student role strictly away from privileged operations", () => {
    const studentRole = roles.STUDENT;

    assert.equal(ADMIN_ROLES.includes(studentRole), false);
    assert.equal(STAFF_ROLES.includes(studentRole), false);
  });
});
