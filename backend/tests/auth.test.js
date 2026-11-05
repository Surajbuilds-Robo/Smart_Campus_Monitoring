const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = require("../src/app");
const authenticate = require("../middleware/authenticate");
const authorize = require("../middleware/authorize");
const { createToken, publicUser: authPublicUser } = require("../modules/auth/auth.service");
const { createUser, updateUser, publicUser: userPublicUser } = require("../modules/users/user.service");
const { roles } = require("../../shared/constants.json");

describe("Authentication & Authorization Suite", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testSecret = "0123456789abcdef0123456789abcdef"; // 32 chars
  let server;
  let baseUrl;

  before(async () => {
    process.env.JWT_SECRET = testSecret;
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
    process.env.JWT_SECRET = originalSecret;
    if (server?.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe("Token Signing & Claims", () => {
    test("createToken generates valid HS256 JWT with subject, role, and departmentId", () => {
      const mockUser = {
        _id: "660c11112222333344445555",
        role: roles.DEPT_HEAD,
        departmentId: "660c99998888777766665555",
      };

      const token = createToken(mockUser);
      assert.strictEqual(typeof token, "string");

      const decoded = jwt.verify(token, testSecret, { algorithms: ["HS256"] });
      assert.strictEqual(decoded.sub, "660c11112222333344445555");
      assert.strictEqual(decoded.role, roles.DEPT_HEAD);
      assert.strictEqual(decoded.departmentId, "660c99998888777766665555");
    });

    test("createToken rejects insecure or short JWT_SECRET (< 32 characters)", () => {
      process.env.JWT_SECRET = "too-short";
      try {
        assert.throws(
          () => createToken({ _id: "123", role: roles.STUDENT }),
          /JWT_SECRET must be configured securely with at least 32 characters/
        );
      } finally {
        process.env.JWT_SECRET = testSecret;
      }
    });
  });

  describe("authenticate Middleware", () => {
    function createMockRes() {
      const res = {
        statusCode: null,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.body = data;
          return this;
        },
      };
      return res;
    }

    test("allows request with valid JWT and populates req.user", () => {
      const token = jwt.sign(
        { role: roles.FACULTY, departmentId: "dept-123" },
        testSecret,
        { subject: "user-456", algorithm: "HS256" }
      );

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      let nextCalled = false;

      authenticate(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.deepStrictEqual(req.user, {
        id: "user-456",
        role: roles.FACULTY,
        departmentId: "dept-123",
      });
    });

    test("rejects missing authorization header with 401", () => {
      const req = { headers: {} };
      const res = createMockRes();

      authenticate(req, res, () => {});

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, "Authentication token is required.");
    });

    test("rejects non-Bearer authorization header with 401", () => {
      const req = { headers: { authorization: "Basic 123456" } };
      const res = createMockRes();

      authenticate(req, res, () => {});

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.success, false);
    });

    test("rejects expired token with 401 and specific expiration message", () => {
      const expiredToken = jwt.sign(
        { role: roles.STUDENT },
        testSecret,
        { subject: "user-999", algorithm: "HS256", expiresIn: "-1s" }
      );

      const req = { headers: { authorization: `Bearer ${expiredToken}` } };
      const res = createMockRes();

      authenticate(req, res, () => {});

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.message, "Authentication token has expired.");
    });

    test("rejects invalid signature token with 401", () => {
      const badToken = jwt.sign(
        { role: roles.STUDENT },
        "wrong-secret-0123456789abcdef012345",
        { subject: "user-999", algorithm: "HS256" }
      );

      const req = { headers: { authorization: `Bearer ${badToken}` } };
      const res = createMockRes();

      authenticate(req, res, () => {});

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.message, "Invalid authentication token.");
    });

    test("rejects token with unknown / unauthorized role claim with 401", () => {
      const bogusRoleToken = jwt.sign(
        { role: "HACKER_ROLE" },
        testSecret,
        { subject: "user-999", algorithm: "HS256" }
      );

      const req = { headers: { authorization: `Bearer ${bogusRoleToken}` } };
      const res = createMockRes();

      authenticate(req, res, () => {});

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.message, "Invalid authentication token.");
    });
  });

  describe("authorize Middleware", () => {
    function createMockRes() {
      const res = {
        statusCode: null,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(data) {
          this.body = data;
          return this;
        },
      };
      return res;
    }

    test("throws during initialization if invalid role or no role passed", () => {
      assert.throws(() => authorize(), /authorize requires at least one allowed role/);
      assert.throws(() => authorize("NON_EXISTENT_ROLE"), /Unknown authorization role/);
    });

    test("allows access when user has matching role", () => {
      const middleware = authorize(roles.SUPER_ADMIN, roles.DEPT_HEAD);
      const req = { user: { id: "1", role: roles.SUPER_ADMIN } };
      const res = createMockRes();
      let nextCalled = false;

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
    });

    test("denies access with 403 when user has non-matching role", () => {
      const middleware = authorize(roles.SUPER_ADMIN);
      const req = { user: { id: "2", role: roles.STUDENT } };
      const res = createMockRes();
      let nextCalled = false;

      middleware(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(res.statusCode, 403);
      assert.strictEqual(res.body.success, false);
      assert.strictEqual(res.body.message, "You do not have permission to access this resource.");
    });

    test("denies access with 401 when req.user is unauthenticated", () => {
      const middleware = authorize(roles.SUPER_ADMIN);
      const req = { user: null };
      const res = createMockRes();

      middleware(req, res, () => {});

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.message, "Authentication is required.");
    });
  });

  describe("Password Hashing & Verification", () => {
    test("bcrypt hashes password with salt rounds 12 and verifies correctly", async () => {
      const plainPassword = "SecurePassword123!";
      const hash = await bcrypt.hash(plainPassword, 12);

      assert.ok(hash.startsWith("$2a$12$") || hash.startsWith("$2b$12$"));

      const isMatch = await bcrypt.compare(plainPassword, hash);
      assert.strictEqual(isMatch, true);

      const isMismatch = await bcrypt.compare("WrongPassword123!", hash);
      assert.strictEqual(isMismatch, false);
    });
  });

  describe("Safe User Projections (No Credential Leak)", () => {
    test("auth publicUser strips passwordHash and sensitive fields", () => {
      const userDoc = {
        _id: "660c11112222333344445555",
        name: "Alice Smith",
        email: "alice@campus.edu",
        role: roles.FACULTY,
        departmentId: "660c99998888777766665555",
        passwordHash: "$2b$12$e1234567890abcdefghijklmnopqrstuvwx",
        isActive: true,
      };

      const projected = authPublicUser(userDoc);
      assert.strictEqual(projected.passwordHash, undefined);
      assert.strictEqual(projected.password, undefined);
      assert.strictEqual(projected.id, "660c11112222333344445555");
      assert.strictEqual(projected.email, "alice@campus.edu");
    });

    test("user service publicUser strips passwordHash and sensitive fields", () => {
      const userDoc = {
        _id: "660c11112222333344445555",
        name: "Bob Jones",
        email: "bob@campus.edu",
        role: roles.STUDENT,
        passwordHash: "$2b$12$e1234567890abcdefghijklmnopqrstuvwx",
        isActive: true,
      };

      const projected = userPublicUser(userDoc);
      assert.strictEqual(projected.passwordHash, undefined);
      assert.strictEqual(projected.password, undefined);
      assert.strictEqual(projected.id, "660c11112222333344445555");
    });
  });

  describe("Role Privilege & Department Boundary Enforcement", () => {
    test("DEPT_HEAD cannot create SUPER_ADMIN or DEPT_HEAD", async () => {
      const deptHeadActor = {
        id: "dept-head-1",
        role: roles.DEPT_HEAD,
        departmentId: "dept-cs-1",
      };

      await assert.rejects(
        async () => {
          await createUser(deptHeadActor, {
            name: "Hacker Admin",
            email: "hacker@campus.edu",
            password: "password123",
            role: roles.SUPER_ADMIN,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.ok(err.message.includes("Department heads cannot create administrator"));
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await createUser(deptHeadActor, {
            name: "Second Dept Head",
            email: "head2@campus.edu",
            password: "password123",
            role: roles.DEPT_HEAD,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });

    test("DEPT_HEAD cannot provision users for another department", async () => {
      const deptHeadActor = {
        id: "dept-head-1",
        role: roles.DEPT_HEAD,
        departmentId: "dept-cs-1",
      };

      await assert.rejects(
        async () => {
          await createUser(deptHeadActor, {
            name: "EE Student",
            email: "eestudent@campus.edu",
            password: "password123",
            role: roles.STUDENT,
            departmentId: "dept-ee-2",
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          assert.ok(err.message.includes("Department heads cannot create users for another department"));
          return true;
        }
      );
    });

    test("STUDENT and FACULTY are forbidden from user management", async () => {
      const studentActor = {
        id: "student-1",
        role: roles.STUDENT,
      };

      await assert.rejects(
        async () => {
          await createUser(studentActor, {
            name: "Student Friend",
            email: "friend@campus.edu",
            password: "password123",
            role: roles.STUDENT,
          });
        },
        (err) => {
          assert.strictEqual(err.statusCode, 403);
          return true;
        }
      );
    });
  });

  describe("HTTP Endpoint Route Protection", () => {
    test("GET /api/v1/auth/me without token returns 401", async () => {
      const res = await fetch(`${baseUrl}/api/v1/auth/me`);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.message, "Authentication token is required.");
    });

    test("GET /api/v1/users without token returns 401", async () => {
      const res = await fetch(`${baseUrl}/api/v1/users`);
      assert.strictEqual(res.status, 401);
      const data = await res.json();
      assert.strictEqual(data.success, false);
    });

    test("GET /api/v1/users with STUDENT token returns 403 Forbidden", async () => {
      const studentToken = jwt.sign(
        { role: roles.STUDENT },
        testSecret,
        { subject: "student-id-123", algorithm: "HS256" }
      );

      const res = await fetch(`${baseUrl}/api/v1/users`, {
        headers: { Authorization: `Bearer ${studentToken}` },
      });

      assert.strictEqual(res.status, 403);
      const data = await res.json();
      assert.strictEqual(data.success, false);
      assert.strictEqual(data.message, "You do not have permission to access this resource.");
    });
  });
});
