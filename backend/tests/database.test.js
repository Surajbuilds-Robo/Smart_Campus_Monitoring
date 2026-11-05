const { test, describe } = require("node:test");
const assert = require("node:assert");

const { connectDB, getDBStatus } = require("../src/config/database");

describe("Database Configuration & Lifecycle", () => {
  test("getDBStatus returns valid status object", () => {
    const status = getDBStatus();
    assert.strictEqual(typeof status.readyState, "number");
    assert.strictEqual(typeof status.status, "string");
    assert.strictEqual(typeof status.isConnected, "boolean");
  });

  test("connectDB rejects when URI is missing", async () => {
    await assert.rejects(
      async () => {
        await connectDB("");
      },
      {
        message: "Cannot connect to MongoDB: URI is required.",
      }
    );
  });
});
