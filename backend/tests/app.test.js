const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");

const app = require("../src/app");

describe("Express App & Middleware Suite", () => {
  let server;
  let baseUrl;

  before(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test("GET /api/v1/health returns 200 with operational status", async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.message, "Smart Campus Monitoring API is running.");
    assert.ok(data.database);
    assert.strictEqual(typeof data.uptime, "number");
    assert.ok(data.timestamp);
  });

  test("GET non-existent endpoint triggers 404 handler", async () => {
    const res = await fetch(`${baseUrl}/api/v1/random-non-existent-route-999`);
    assert.strictEqual(res.status, 404);

    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes("Route not found"));
  });

  test("Malformed JSON request body returns 400 Bad Request via error handler", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid_json: ",
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  test("CORS allows valid configured origin", async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Origin: "http://localhost:5173" },
    });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
  });
});
