const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const app = require("../src/app");
const User = require("../modules/users/user.model");
const { roles } = require("../../shared/constants.json");

describe("Login Session & Repeated Authentication Regression Suite", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testSecret = "0123456789abcdef0123456789abcdef"; // 32 chars
  let mongod;
  let server;
  let baseUrl;
  let testUser;

  before(async () => {
    process.env.JWT_SECRET = testSecret;
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());

    server = http.createServer(app);
    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });

    const passwordHash = await bcrypt.hash("TestPass@123", 10);
    testUser = await User.create({
      name: "Login Test User",
      email: "login-test@campus.edu",
      passwordHash,
      role: roles.SUPER_ADMIN,
      isActive: true,
    });
  });

  after(async () => {
    process.env.JWT_SECRET = originalSecret;
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  });

  test("1. valid credentials log in successfully and return user and token", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "login-test@campus.edu", password: "TestPass@123" }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, "login-test@campus.edu");
    assert.ok(typeof body.data.token === "string" && body.data.token.length > 20);
  });

  test("2. repeated login with valid credentials succeeds consistently without rate-limiting", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "login-test@campus.edu", password: "TestPass@123" }),
      });

      assert.strictEqual(res.status, 200);
      const body = await res.json();
      assert.strictEqual(body.success, true);
      assert.ok(body.data.token);
    }
  });

  test("3. login with stale Authorization header succeeds and does not key on stale token", async () => {
    const staleToken = jwt.sign(
      { role: roles.STUDENT, sub: "000000000000000000000000" },
      testSecret,
      { expiresIn: "1s" }
    );

    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${staleToken}`,
      },
      body: JSON.stringify({ email: "login-test@campus.edu", password: "TestPass@123" }),
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.user.email, "login-test@campus.edu");
  });

  test("4. incorrect password returns 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "login-test@campus.edu", password: "WrongPassword999" }),
    });

    assert.strictEqual(res.status, 401);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.message, "Invalid email or password.");
  });

  test("5. disabled account returns 403 Forbidden", async () => {
    const disabledEmail = "disabled-user@campus.edu";
    const passwordHash = await bcrypt.hash("TestPass@123", 10);
    await User.create({
      name: "Disabled User",
      email: disabledEmail,
      passwordHash,
      role: roles.STUDENT,
      isActive: false,
    });

    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: disabledEmail, password: "TestPass@123" }),
    });

    assert.strictEqual(res.status, 403);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.ok(body.message.includes("Account is disabled"));
  });

  test("6. missing email or password returns 400 Bad Request", async () => {
    const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@campus.edu" }),
    });

    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.success, false);
  });

  test("7. GET /auth/me returns current user profile when valid token provided", async () => {
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "login-test@campus.edu", password: "TestPass@123" }),
    });
    const { data: { token } } = await loginRes.json();

    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.strictEqual(meRes.status, 200);
    const body = await meRes.json();
    assert.strictEqual(body.data.user.email, "login-test@campus.edu");
    assert.strictEqual(body.data.user.passwordHash, undefined);
  });

  test("8. POST /auth/logout acknowledges logout with 200", async () => {
    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "login-test@campus.edu", password: "TestPass@123" }),
    });
    const { data: { token } } = await loginRes.json();

    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.strictEqual(logoutRes.status, 200);
    const body = await logoutRes.json();
    assert.strictEqual(body.success, true);
  });

  test("9. GET /auth/me rejects expired tokens with 401", async () => {
    const expiredToken = jwt.sign(
      { role: roles.SUPER_ADMIN, sub: String(testUser._id) },
      testSecret,
      { expiresIn: "-1s" }
    );

    const meRes = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    assert.strictEqual(meRes.status, 401);
    const body = await meRes.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.message, "Authentication token has expired.");
  });
});
