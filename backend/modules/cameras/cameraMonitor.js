const Camera = require("./camera.model");
const { verifyStreamReachability } = require("./streamVerifier");

let monitorInterval = null;
let isChecking = false;
let checkCycleCount = 0;

function safePublishStatus(cameraDoc) {
  try {
    const { publishCameraStatus } = require("../../src/realtime/eventPublisher");
    publishCameraStatus(cameraDoc);
  } catch {
    // Non-fatal if socket server not active
  }
}

/**
 * Checks a single camera for stream reachability and updates DB and Socket.IO status.
 * Never marks a camera online without genuine stream response headers.
 */
async function checkCameraHealth(camera, options = {}) {
  if (!camera || !camera.streamUrl || !camera.isActive) {
    return { checked: false, reason: "Inactive or missing streamUrl" };
  }

  const isMjpegOrHttp =
    camera.streamType === "mjpeg" ||
    camera.cameraType === "ip_camera" ||
    camera.streamUrl.startsWith("http://") ||
    camera.streamUrl.startsWith("https://");

  if (!isMjpegOrHttp) {
    // RTSP without HTTP probe endpoint is handled via gateway
    return { checked: false, reason: "Non-HTTP stream protocol" };
  }

  const previousStatus = camera.status;
  const timeoutMs = options.timeoutMs || 2200;
  const result = await verifyStreamReachability(camera.streamUrl, timeoutMs);

  if (result.reachable) {
    const now = new Date();
    camera.lastSeenAt = now;
    camera.lastHeartbeat = now;
    camera.consecutiveFailures = 0;

    if (previousStatus !== "online") {
      camera.status = "online";
      await camera.save();
      safePublishStatus(camera);
    } else {
      // Debounce saving if lastHeartbeat was updated within the last 30 seconds
      const lastSavedTime = camera.updatedAt ? new Date(camera.updatedAt).getTime() : 0;
      if (Date.now() - lastSavedTime > 30000) {
        await camera.save();
      }
    }

    return {
      checked: true,
      cameraId: camera.cameraId,
      status: "online",
      reachable: true,
      latencyMs: result.latencyMs,
      changed: previousStatus !== "online",
    };
  } else {
    // Stream unreachable
    const failures = (camera.consecutiveFailures || 0) + 1;
    camera.consecutiveFailures = failures;

    // Transition to offline after 2 consecutive failed probes to avoid dropping on brief Wi-Fi jitter
    if (previousStatus === "online" && failures >= 2) {
      camera.status = "offline";
      await camera.save();
      safePublishStatus(camera);
      return {
        checked: true,
        cameraId: camera.cameraId,
        status: "offline",
        reachable: false,
        error: result.error,
        changed: true,
      };
    }

    return {
      checked: true,
      cameraId: camera.cameraId,
      status: camera.status,
      reachable: false,
      error: result.error,
      changed: false,
    };
  }
}

/**
 * Perform a monitoring pass over all active registered cameras.
 * Uses bounded exponential backoff for offline cameras.
 */
async function checkAllCamerasNow() {
  if (isChecking) return;
  isChecking = true;
  checkCycleCount++;

  try {
    const cameras = await Camera.find({
      isActive: true,
      streamUrl: { $exists: true, $ne: "" },
    });

    for (const camera of cameras) {
      // If camera is offline and has failed repeatedly, apply bounded backoff:
      if (camera.status === "offline") {
        const failures = camera.consecutiveFailures || 0;
        if (failures > 15 && checkCycleCount % 3 !== 0) {
          continue; // probe every 3rd cycle (~30s)
        } else if (failures > 5 && checkCycleCount % 2 !== 0) {
          continue; // probe every 2nd cycle (~20s)
        }
      }

      try {
        await checkCameraHealth(camera);
      } catch (err) {
        // Individual camera errors shouldn't crash the loop
      }
    }
  } catch (err) {
    // Top-level error catch
  } finally {
    isChecking = false;
  }
}

/**
 * Starts periodic background camera health monitoring and automatic reconnection.
 */
function startCameraMonitoring(intervalMs = 10000) {
  if (monitorInterval) return;

  // Initial pass after a brief 2-second startup settling delay
  setTimeout(() => {
    checkAllCamerasNow().catch(() => {});
  }, 2000).unref();

  monitorInterval = setInterval(() => {
    checkAllCamerasNow().catch(() => {});
  }, intervalMs);

  monitorInterval.unref();
}

/**
 * Stops periodic camera health monitoring.
 */
function stopCameraMonitoring() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isChecking = false;
}

function isMonitoring() {
  return monitorInterval !== null;
}

module.exports = {
  startCameraMonitoring,
  stopCameraMonitoring,
  isMonitoring,
  checkCameraHealth,
  checkAllCamerasNow,
};
