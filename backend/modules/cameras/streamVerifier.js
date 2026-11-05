const http = require("http");
const https = require("https");
const { URL } = require("url");

/**
 * SSRF Protection and Stream Reachability Verifier for Smart Campus CCTV.
 * Validates URLs against SSRF threats and tests live stream connectivity.
 */

// Blocked private / cloud metadata IP ranges
const BLOCKED_HOSTS = [
  "169.254.169.254", // AWS/GCP/Azure link-local metadata
  "169.254.169.250",
  "metadata.google.internal",
  "metadata",
  "0.0.0.0",
  "255.255.255.255",
];

// Blocked ports (internal services, databases, SSH, etc.)
const BLOCKED_PORTS = new Set([
  22, 23, 25, 53, 110, 143, 389, 636, 1433, 1521, 2049, 2375, 2376, 3306,
  5432, 6379, 9200, 11211, 27017, 28017,
]);

/**
 * Validates a stream URL for SSRF vulnerabilities and protocol correctness.
 * @param {string} rawUrl - Target stream URL
 * @returns {{ valid: boolean, error?: string, parsedUrl?: URL, isBasePath?: boolean }}
 */
function validateStreamUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return { valid: false, error: "Stream URL is required." };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, error: "Invalid URL syntax. Format: http://<ip>:<port>/video" };
  }

  const protocol = parsed.protocol.toLowerCase();
  const allowedProtocols = ["http:", "https:", "rtsp:"];
  if (!allowedProtocols.includes(protocol)) {
    return {
      valid: false,
      error: `Unsupported stream protocol "${protocol}". Allowed: http, https, rtsp.`,
    };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block cloud metadata and broadcast addresses
  if (BLOCKED_HOSTS.includes(hostname) || hostname.startsWith("169.254.")) {
    return {
      valid: false,
      isProhibited: true,
      error: "Access to cloud metadata and link-local addresses is prohibited.",
    };
  }

  // Validate port if explicitly specified
  if (parsed.port) {
    const portNum = parseInt(parsed.port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      return { valid: false, error: "Invalid port number in stream URL." };
    }
    if (BLOCKED_PORTS.has(portNum)) {
      return {
        valid: false,
        error: `Port ${portNum} is restricted for security reasons.`,
      };
    }
  }

  const isBasePath = parsed.pathname === "" || parsed.pathname === "/";

  return { valid: true, parsedUrl: parsed, isBasePath };
}

/**
 * Test genuine reachability of an HTTP / MJPEG / HLS stream endpoint.
 * Sends a lightweight HTTP request with a strict timeout and aborts immediately
 * after headers are read to avoid consuming excessive camera bandwidth.
 *
 * Distinguishes:
 * - Connection Refused (phone server not started)
 * - Host Unreachable / Timeout (network or IP mismatch)
 * - Base page (text/html) vs Video Stream (multipart/x-mixed-replace)
 * - 404 (wrong endpoint path)
 * - 401/403 (authentication required)
 *
 * @param {string} rawUrl - Target stream URL
 * @param {number} timeoutMs - Max wait time in ms (default 3500)
 * @returns {Promise<{ reachable: boolean, status?: number, contentType?: string, latencyMs?: number, error?: string, action?: string, suggestedUrl?: string, code?: string }>}
 */
async function verifyStreamReachability(rawUrl, timeoutMs = 3500) {
  const validation = validateStreamUrl(rawUrl);
  if (!validation.valid) {
    return { reachable: false, error: validation.error, code: "INVALID_URL" };
  }

  const { parsedUrl } = validation;
  const protocol = parsedUrl.protocol.toLowerCase();

  // Direct HTTP / HTTPS verification
  if (protocol === "http:" || protocol === "https:") {
    const startTime = Date.now();
    const client = protocol === "https:" ? https : http;

    return new Promise((resolve) => {
      let resolved = false;

      const safeResolve = (result) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (protocol === "https:" ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers: {
          "User-Agent": "SmartCampus-CCTV-HealthCheck/1.0",
          Accept: "*/*",
          Range: "bytes=0-1024",
        },
        timeout: timeoutMs,
      };

      const req = client.request(options, (res) => {
        const latencyMs = Date.now() - startTime;
        const statusCode = res.statusCode || 0;
        const contentType = (res.headers["content-type"] || "").toLowerCase();

        // Immediately abort the incoming data stream to save phone camera resources
        req.destroy();

        // 1. Handle HTTP Redirects safely (SSRF Protection on Location)
        if (statusCode >= 300 && statusCode < 400 && res.headers.location) {
          const redirectUrl = res.headers.location;
          const redirectValidation = validateStreamUrl(redirectUrl);
          if (!redirectValidation.valid) {
            return safeResolve({
              reachable: false,
              status: statusCode,
              latencyMs,
              code: "PROHIBITED_REDIRECT",
              error: `SSRF Violation: Server attempted redirect to prohibited target "${redirectUrl}".`,
              action: "Check server redirect settings.",
            });
          }
        }

        // 2. Handle Authentication
        if (statusCode === 401 || statusCode === 403) {
          return safeResolve({
            reachable: false,
            status: statusCode,
            contentType,
            latencyMs,
            requiresAuth: true,
            code: "AUTH_REQUIRED",
            error: `Authentication required (HTTP ${statusCode}). Camera server is password protected.`,
            action: "In IP Webcam on your phone, go to 'Connection settings' -> 'Login/password' to verify credentials or disable password.",
          });
        }

        // 3. Handle 404 Endpoint Not Found
        if (statusCode === 404) {
          const suggested = `${parsedUrl.origin}/video`;
          return safeResolve({
            reachable: false,
            status: 404,
            contentType,
            latencyMs,
            code: "PATH_NOT_FOUND",
            suggestedUrl: suggested,
            error: `HTTP 404 Not Found at path "${parsedUrl.pathname}". The stream endpoint was not found on the camera server.`,
            action: `For Android IP Webcam, the live video endpoint is "/video" (e.g., ${suggested}).`,
          });
        }

        // 4. Handle 200 OK - Inspect Content-Type
        if (statusCode >= 200 && statusCode < 300) {
          const isHtmlWebPage = contentType.includes("text/html");
          const isMjpegStream =
            contentType.includes("mixed-replace") || contentType.includes("multipart");
          const isImageSnapshot =
            contentType.includes("image/jpeg") ||
            contentType.includes("image/png") ||
            contentType.includes("image/");
          const isHlsOrVideo =
            contentType.includes("mpegurl") ||
            contentType.includes("video/") ||
            parsedUrl.pathname.endsWith(".m3u8");

          // Catch base page mistakenly entered without stream path
          if (isHtmlWebPage) {
            const suggested = `${parsedUrl.origin}/video`;
            return safeResolve({
              reachable: false,
              status: statusCode,
              contentType,
              latencyMs,
              code: "BASE_PAGE_NOT_STREAM",
              suggestedUrl: suggested,
              error: `Base web interface reached (text/html). You connected to the phone's web control panel, not the video stream.`,
              action: `Append "/video" to your Stream URL (e.g., ${suggested}) to receive live MJPEG frames.`,
            });
          }

          if (isMjpegStream || isImageSnapshot || isHlsOrVideo) {
            return safeResolve({
              reachable: true,
              status: statusCode,
              contentType,
              latencyMs,
              streamFormat: isMjpegStream ? "mjpeg" : isImageSnapshot ? "snapshot" : "video",
              message: isMjpegStream
                ? "Live MJPEG video stream verified!"
                : "Camera frame endpoint verified!",
            });
          }

          // Other non-video 200 responses
          return safeResolve({
            reachable: false,
            status: statusCode,
            contentType,
            latencyMs,
            code: "UNSUPPORTED_CONTENT_TYPE",
            error: `Unsupported content-type "${contentType}". Expected live stream (multipart/x-mixed-replace) or image frame.`,
            action: "For IP Webcam, enter the complete stream endpoint ending in '/video'.",
          });
        }

        // 5. Other HTTP Status Codes
        return safeResolve({
          reachable: false,
          status: statusCode,
          contentType,
          latencyMs,
          code: `HTTP_${statusCode}`,
          error: `Camera HTTP responded with error status ${statusCode}.`,
          action: "Check camera server logs or restart the phone camera server.",
        });
      });

      req.on("timeout", () => {
        req.destroy();
        safeResolve({
          reachable: false,
          code: "TIMED_OUT",
          error: `Connection timed out after ${timeoutMs}ms (${parsedUrl.hostname}:${parsedUrl.port || 8080}).`,
          action:
            "1) Ensure phone screen is awake and app is running in foreground.\n2) Check if your Wi-Fi router has 'Client/AP Isolation' enabled.",
        });
      });

      req.on("error", (err) => {
        const port = parsedUrl.port || 8080;
        let code = err.code || "CONNECTION_FAILED";
        let error = err.message || "Failed to reach camera stream.";
        let action = "Ensure your computer and phone are connected to the same Wi-Fi network.";

        if (err.code === "ECONNREFUSED") {
          code = "CONNECTION_REFUSED";
          error = `Connection refused by ${parsedUrl.hostname}:${port}. The phone is reachable over Wi-Fi, but no server is listening on port ${port}.`;
          action = "On your Android phone: open IP Webcam, scroll to the bottom, and tap 'Start server'.";
        } else if (err.code === "ENOTFOUND") {
          code = "DNS_NOT_FOUND";
          error = `Could not resolve hostname "${parsedUrl.hostname}".`;
          action = "Enter a valid local IP address (e.g., http://10.112.164.88:8080/video).";
        } else if (err.code === "EHOSTUNREACH" || err.code === "ENETUNREACH") {
          code = "HOST_UNREACHABLE";
          error = `Host unreachable (${parsedUrl.hostname}). The computer cannot route packets to the phone.`;
          action = "Ensure your computer and phone are on the exact same Wi-Fi network and check if the phone was assigned a different IP.";
        }

        safeResolve({
          reachable: false,
          code,
          error,
          action,
        });
      });

      req.end();
    });
  }

  // RTSP check (RTSP requires a gateway; report reachability protocol requirement)
  if (protocol === "rtsp:") {
    return {
      reachable: false,
      protocol: "rtsp",
      code: "RTSP_GATEWAY_REQUIRED",
      error: "RTSP streams require a local gateway (e.g., MediaMTX) to convert to browser-compatible HLS or WebRTC.",
      action: "For Android phones, select 'MJPEG (HTTP)' protocol and use port 8080.",
    };
  }

  return { reachable: false, error: "Unsupported stream protocol.", code: "UNSUPPORTED_PROTOCOL" };
}

module.exports = {
  validateStreamUrl,
  verifyStreamReachability,
};
