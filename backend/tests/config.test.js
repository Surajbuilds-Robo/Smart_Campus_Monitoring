const { test, describe } = require("node:test");
const assert = require("node:assert");

const { validateEnv } = require("../src/config/env");

describe("Environment Configuration", () => {
  test("validateEnv succeeds with current valid development environment", () => {
    const validated = validateEnv();
    assert.ok(validated.MONGODB_URI);
    assert.ok(validated.JWT_SECRET);
    assert.strictEqual(typeof validated.PORT, "number");
  });
});
