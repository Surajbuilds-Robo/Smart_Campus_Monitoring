const http = require("http");
const os = require("os");
const { validateStreamUrl, verifyStreamReachability } = require("./streamVerifier");

// In-memory rate limiting map: cameraId -> timestamp
const lastScanTimes = new Map();
const RATE_LIMIT_COOLDOWN_MS = 15000;

/**
 * Determine local RFC1918 private IPv4 subnets from host network interfaces.
 * Returns an array of subnet prefixes (e.g., ["192.168.1."])
 */
function getLocalPrivateSubnets() {
  const interfaces = os.networkInterfaces();
  const subnets = new Set();

  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        const ip = net.address;
        if (isPrivateIPv4(ip)) {
          const parts = ip.split(".");
          subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}.`);
        }
      }
    }
  }

  return Array.from(subnets);
}

/**
 * Validates whether an IP address belongs to RFC1918 private ranges.
 */
function isPrivateIPv4(ip) {
  if (!ip || typeof ip !== "string") return false;
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
    return false;
  }

  // 10.0.0.0/8
  if (parts[0] === 10) return true;
  // 172.16.0.0/12
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;

  return false;
}

/**
 * Probe a single IP and port for an active Android IP Webcam server.
 * Uses a short timeout and aborts the request immediately after reading headers.
 */
function probeCandidate(ip, port = 8080, timeoutMs = 450) {
  return new Promise((resolve) => {
    let settled = false;

    const safeResolve = (val) => {
      if (!settled) {
        settled = true;
        resolve(val);
      }
    };

    const timer = setTimeout(() => {
      safeResolve({ found: false });
    }, timeoutMs);

    const options = {
      hostname: ip,
      port,
      path: "/status.json",
      method: "GET",
      timeout: timeoutMs,
      headers: {
        "User-Agent": "SmartCampus-IPWebcam-Probe/1.0",
        Accept: "*/*",
      },
    };

    const req = http.request(options, (res) => {
      clearTimeout(timer);
      const statusCode = res.statusCode || 0;
      const contentType = (res.headers["content-type"] || "").toLowerCase();
      const serverHeader = (res.headers["server"] || "").toLowerCase();

      req.destroy();

      // IP Webcam responds to /status.json with 200 and application/json or Server: Android
      if (
        (statusCode >= 200 && statusCode < 300) ||
        contentType.includes("json") ||
        contentType.includes("image") ||
        contentType.includes("mixed-replace") ||
        serverHeader.includes("android")
      ) {
        safeResolve({
          found: true,
          ip,
          port,
          statusCode,
          contentType,
          serverHeader,
        });
      } else {
        safeResolve({ found: false });
      }
    });

    req.on("timeout", () => {
      req.destroy();
      clearTimeout(timer);
      safeResolve({ found: false });
    });

    req.on("error", () => {
      clearTimeout(timer);
      safeResolve({ found: false });
    });

    req.end();
  });
}

/**
 * Scan a /24 subnet for an Android IP Webcam server.
 * Scans candidate hosts in chunks of 25 with early return on discovery.
 */
async function scanSubnet(subnetPrefix, port = 8080, concurrency = 25) {
  if (!subnetPrefix.endsWith(".")) {
    subnetPrefix += ".";
  }

  // Generate candidate IPs (1..254)
  const candidateIps = [];
  for (let i = 1; i <= 254; i++) {
    candidateIps.push(`${subnetPrefix}${i}`);
  }

  // Scan in chunks
  for (let i = 0; i < candidateIps.length; i += concurrency) {
    const chunk = candidateIps.slice(i, i + concurrency);
    const probePromises = chunk.map((ip) => probeCandidate(ip, port));
    const results = await Promise.all(probePromises);

    const foundMatch = results.find((r) => r.found);
    if (foundMatch) {
      // Confirm genuine stream reachability on /video endpoint
      const streamUrl = `http://${foundMatch.ip}:${foundMatch.port}/video`;
      const verifyCheck = await verifyStreamReachability(streamUrl, 1500);

      if (verifyCheck.reachable) {
        return {
          found: true,
          ip: foundMatch.ip,
          port: foundMatch.port,
          streamUrl,
          previewUrl: `http://${foundMatch.ip}:${foundMatch.port}/shot.jpg`,
          latencyMs: verifyCheck.latencyMs,
        };
      }
    }
  }

  return { found: false };
}

/**
 * Discover Android phone IP camera on local subnet.
 * Respects rate limits, SSRF boundaries, and private network restrictions.
 */
async function discoverPhoneIpCamera(cameraDoc, options = {}) {
  const cameraKey = String(cameraDoc._id || cameraDoc.cameraId || "default");
  const now = Date.now();
  const lastScan = lastScanTimes.get(cameraKey) || 0;

  if (now - lastScan < RATE_LIMIT_COOLDOWN_MS && !options.skipRateLimit) {
    const waitSec = Math.ceil((RATE_LIMIT_COOLDOWN_MS - (now - lastScan)) / 1000);
    return {
      success: false,
      rateLimited: true,
      retryAfter: waitSec,
      message: `Discovery scan rate-limited. Please wait ${waitSec}s before scanning again.`,
    };
  }

  lastScanTimes.set(cameraKey, now);

  const port = options.port || cameraDoc.discoveryPort || 8080;

  // Determine candidate subnets
  const candidateSubnets = new Set();

  // 1. If camera has an existing streamUrl, extract its subnet first
  if (cameraDoc.streamUrl) {
    try {
      const url = new URL(cameraDoc.streamUrl);
      if (isPrivateIPv4(url.hostname)) {
        const parts = url.hostname.split(".");
        candidateSubnets.add(`${parts[0]}.${parts[1]}.${parts[2]}.`);
      }
    } catch {}
  }

  // 2. Add local machine's private interface subnets
  for (const s of getLocalPrivateSubnets()) {
    candidateSubnets.add(s);
  }

  // 3. Fallback default if running in container or host has no discovered interfaces
  if (candidateSubnets.size === 0) {
    candidateSubnets.add("192.168.1.");
  }

  // Scan candidate subnets
  for (const subnet of candidateSubnets) {
    const result = await scanSubnet(subnet, port);
    if (result.found) {
      return {
        success: true,
        discovered: true,
        ip: result.ip,
        port: result.port,
        streamUrl: result.streamUrl,
        previewUrl: result.previewUrl,
        latencyMs: result.latencyMs,
        message: `Successfully discovered Android IP Webcam at ${result.ip}:${result.port}`,
      };
    }
  }

  return {
    success: true,
    discovered: false,
    message: `No active IP Webcam stream found on port ${port}. Ensure IP Webcam is open on your phone, 'Start server' is tapped, and both devices are on the same Wi-Fi.`,
  };
}

module.exports = {
  isPrivateIPv4,
  getLocalPrivateSubnets,
  probeCandidate,
  scanSubnet,
  discoverPhoneIpCamera,
};
