const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { validateStreamUrl, verifyStreamReachability } = require("../modules/cameras/streamVerifier");

describe("Stream Verifier Deep Diagnostics & SSRF Guard Suite", () => {
  let mockServer;
  let mockPort;

  before(async () => {
    mockServer = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1`);

      if (url.pathname === "/") {
        // Base control panel HTML
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<html><body><h1>IP Webcam Control Panel</h1></body></html>");
      } else if (url.pathname === "/video") {
        // Live MJPEG video stream
        res.writeHead(200, {
          "Content-Type": "multipart/x-mixed-replace; boundary=--boundarydonotcross",
          "Connection": "close",
        });
        res.write("--boundarydonotcross\r\nContent-Type: image/jpeg\r\n\r\n\xFF\xD8\xFF");
        res.end();
      } else if (url.pathname === "/auth-video") {
        res.writeHead(401, { "WWW-Authenticate": "Basic realm=\"IP Webcam\"" });
        res.end("Unauthorized");
      } else if (url.pathname === "/bad-redirect") {
        res.writeHead(302, { "Location": "http://169.254.169.254/latest/meta-data/" });
        res.end();
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
      }
    });

    await new Promise((resolve) => {
      mockServer.listen(0, "127.0.0.1", () => {
        mockPort = mockServer.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    if (mockServer) {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  describe("1. URL Format & SSRF Protection", () => {
    test("rejects invalid protocols", () => {
      const result = validateStreamUrl("ftp://192.168.1.50/video");
      assert.strictEqual(result.valid, false);
      assert.match(result.error, /Unsupported stream protocol/i);
    });

    test("blocks AWS cloud metadata 169.254.169.254", () => {
      const result = validateStreamUrl("http://169.254.169.254/latest/meta-data/");
      assert.strictEqual(result.valid, false);
      assert.strictEqual(result.isProhibited, true);
    });

    test("blocks link-local metadata 169.254.169.250 and internal google metadata", () => {
      const res1 = validateStreamUrl("http://169.254.169.250/video");
      assert.strictEqual(res1.valid, false);
      assert.strictEqual(res1.isProhibited, true);

      const res2 = validateStreamUrl("http://metadata.google.internal/computeMetadata/v1/");
      assert.strictEqual(res2.valid, false);
      assert.strictEqual(res2.isProhibited, true);
    });

    test("allows RFC1918 private IPv4 addresses (10.x.x.x, 192.168.x.x)", () => {
      const res1 = validateStreamUrl("http://10.112.164.88:8080/video");
      assert.strictEqual(res1.valid, true);

      const res2 = validateStreamUrl("http://192.168.1.100:8080/video");
      assert.strictEqual(res2.valid, true);
    });

    test("identifies base paths needing /video", () => {
      const res = validateStreamUrl("http://10.112.164.88:8080");
      assert.strictEqual(res.valid, true);
      assert.strictEqual(res.isBasePath, true);
    });
  });

  describe("2. HTTP Response Code & Content-Type Diagnostics", () => {
    test("diagnoses HTML base page without /video as BASE_PAGE_NOT_STREAM with suggestedUrl", async () => {
      const result = await verifyStreamReachability(`http://127.0.0.1:${mockPort}/`, 2000);
      assert.strictEqual(result.reachable, false);
      assert.strictEqual(result.code, "BASE_PAGE_NOT_STREAM");
      assert.match(result.error, /web control panel/i);
      assert.match(result.action, /video/i);
      assert.strictEqual(result.suggestedUrl, `http://127.0.0.1:${mockPort}/video`);
    });

    test("verifies live MJPEG stream (multipart/x-mixed-replace)", async () => {
      const result = await verifyStreamReachability(`http://127.0.0.1:${mockPort}/video`, 2000);
      assert.strictEqual(result.reachable, true);
      assert.strictEqual(result.streamFormat, "mjpeg");
      assert.match(result.contentType, /multipart/);
    });

    test("diagnoses HTTP 404 endpoint as PATH_NOT_FOUND with /video suggested", async () => {
      const result = await verifyStreamReachability(`http://127.0.0.1:${mockPort}/wrong-path`, 2000);
      assert.strictEqual(result.reachable, false);
      assert.strictEqual(result.code, "PATH_NOT_FOUND");
      assert.strictEqual(result.suggestedUrl, `http://127.0.0.1:${mockPort}/video`);
    });

    test("diagnoses HTTP 401 as AUTH_REQUIRED", async () => {
      const result = await verifyStreamReachability(`http://127.0.0.1:${mockPort}/auth-video`, 2000);
      assert.strictEqual(result.reachable, false);
      assert.strictEqual(result.code, "AUTH_REQUIRED");
      assert.strictEqual(result.requiresAuth, true);
    });

    test("diagnoses SSRF redirect to cloud metadata as PROHIBITED_REDIRECT", async () => {
      const result = await verifyStreamReachability(`http://127.0.0.1:${mockPort}/bad-redirect`, 2000);
      assert.strictEqual(result.reachable, false);
      assert.strictEqual(result.code, "PROHIBITED_REDIRECT");
    });

    test("diagnoses ECONNREFUSED when port is closed", async () => {
      // Connect to an unused high port on localhost
      const result = await verifyStreamReachability("http://127.0.0.1:59999/video", 1000);
      assert.strictEqual(result.reachable, false);
      assert.strictEqual(result.code, "CONNECTION_REFUSED");
      assert.match(result.action, /Start server/i);
    });
  });
});
