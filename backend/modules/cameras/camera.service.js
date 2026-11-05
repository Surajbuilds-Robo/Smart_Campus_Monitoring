const http = require("http");
const https = require("https");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Camera = require("./camera.model");
const Occupancy = require("../occupancy/occupancy.model");
const Incident = require("../incidents/incident.model");
const { recordAudit } = require("../audit/audit.service");
const { validateStreamUrl, verifyStreamReachability } = require("./streamVerifier");
const { discoverPhoneIpCamera, isPrivateIPv4 } = require("./subnetDiscovery");
const { roles, camera: cameraConstants } = require("../../../shared/constants.json");

const VALID_STATUSES = cameraConstants?.statuses || ["online", "offline", "maintenance"];

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function departmentScope(user) {
  if (user.role === roles.SUPER_ADMIN || user.role === roles.SECURITY) return {};

  if (user.role === roles.DEPT_HEAD || user.role === roles.FACULTY) {
    if (!user.departmentId) {
      return { departmentId: null };
    }

    return { departmentId: user.departmentId };
  }

  throw httpError(403, "You do not have permission to access cameras.");
}

function canManage(user) {
  return [roles.SUPER_ADMIN, roles.SECURITY].includes(user?.role);
}

function safePublishStatus(cameraDoc) {
  try {
    const { publishCameraStatus } = require("../../src/realtime/eventPublisher");
    publishCameraStatus(cameraDoc);
  } catch {
    // Non-fatal if socket publisher is not initialized (e.g. In unit tests)
  }
}

async function listCameras(user, filters = {}) {
  const filter = {
    ...departmentScope(user),
    isActive: true,
  };

  if (filters.status) {
    filter.status = filters.status;
  }

  return Camera.find(filter).sort({ createdAt: -1 }).lean();
}

async function getCamera(user, id) {
  if (!id) {
    throw httpError(400, "Invalid camera ID.");
  }

  const isObjId = mongoose.isValidObjectId(id);
  const query = isObjId ? { _id: id } : { cameraId: String(id).trim() };

  const camera = await Camera.findOne({
    ...query,
    ...departmentScope(user),
  }).lean();

  if (!camera) {
    if (!isObjId) {
      throw httpError(400, "Invalid camera ID.");
    }
    throw httpError(404, "Camera not found.");
  }

  return camera;
}

async function createCamera(user, data) {
  if (!canManage(user)) {
    throw httpError(403, "Only SUPER_ADMIN and SECURITY personnel can register cameras.");
  }

  const normalizedCameraId = String(data.cameraId).trim();
  const existing = await Camera.findOne({ cameraId: normalizedCameraId });
  if (existing) {
    throw httpError(409, `Camera ID "${normalizedCameraId}" is already registered.`);
  }

  const departmentId =
    user.role === roles.SUPER_ADMIN
      ? data.departmentId || null
      : user.departmentId;

  if (
    user.role === roles.DEPT_HEAD &&
    data.departmentId &&
    String(data.departmentId) !== String(user.departmentId)
  ) {
    throw httpError(403, "You cannot assign a camera to another department.");
  }

  let streamUrl = data.streamUrl ? data.streamUrl.trim() : "";
  let previewUrl = data.previewUrl ? data.previewUrl.trim() : "";

  // SSRF Protection and URL format validation
  if (streamUrl) {
    const streamValidation = validateStreamUrl(streamUrl);
    if (!streamValidation.valid) {
      throw httpError(400, streamValidation.error);
    }
  }

  if (previewUrl) {
    const previewValidation = validateStreamUrl(previewUrl);
    if (!previewValidation.valid) {
      throw httpError(400, previewValidation.error);
    }
  }

  // Never mark ONLINE simply because a record is created in MongoDB.
  // Validate real reachability before declaring initial online status.
  let initialStatus = "offline";
  let initialHeartbeat = null;

  if (data.status === "online" && streamUrl) {
    const reachCheck = await verifyStreamReachability(streamUrl);
    if (reachCheck.reachable) {
      initialStatus = "online";
      initialHeartbeat = new Date();
    }
  } else if (data.status === "maintenance") {
    initialStatus = "maintenance";
  }

  const camera = await Camera.create({
    name: data.name.trim(),
    cameraId: normalizedCameraId,
    location: data.location.trim(),
    building: data.building ? data.building.trim() : "",
    departmentId,
    status: initialStatus,
    lastHeartbeat: initialHeartbeat,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    streamUrl,
    previewUrl,
    cameraType: data.cameraType || "ip_camera",
    autoReconnect: data.autoReconnect !== undefined ? Boolean(data.autoReconnect) : true,
    discoveryPort: data.discoveryPort ? Number(data.discoveryPort) : 8080,
    lastSeenAt: initialStatus === "online" ? initialHeartbeat : null,
    streamType: data.streamType || "auto",
    streamQualities: Array.isArray(data.streamQualities) ? data.streamQualities : ["720p"],
    dvrSupported: Boolean(data.dvrSupported),
  });

  await recordAudit({
    actor: user,
    action: "CAMERA_CREATED",
    targetModel: "Camera",
    targetId: camera._id,
    departmentId: camera.departmentId,
    details: { cameraId: camera.cameraId, location: camera.location },
  });

  return camera;
}

async function updateCamera(user, id, data) {
  if (!canManage(user)) {
    throw httpError(403, "Only SUPER_ADMIN and SECURITY personnel can update cameras.");
  }

  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid camera ID.");
  }

  const camera = await Camera.findOne({
    _id: id,
    ...departmentScope(user),
  });

  if (!camera) throw httpError(404, "Camera not found.");

  const allowedFields = [
    "name",
    "location",
    "building",
    "isActive",
    "status",
    "streamUrl",
    "previewUrl",
    "streamType",
    "streamQualities",
    "dvrSupported",
    "cameraType",
    "autoReconnect",
    "discoveryPort",
  ];
  const updates = {};

  if (data.streamUrl !== undefined) {
    const trimmed = String(data.streamUrl).trim();
    if (trimmed) {
      const validation = validateStreamUrl(trimmed);
      if (!validation.valid) {
        throw httpError(400, validation.error);
      }
    }
    data.streamUrl = trimmed;
  }

  if (data.previewUrl !== undefined) {
    const trimmed = String(data.previewUrl).trim();
    if (trimmed) {
      const validation = validateStreamUrl(trimmed);
      if (!validation.valid) {
        throw httpError(400, validation.error);
      }
    }
    data.previewUrl = trimmed;
  }

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      updates[field] = data[field];
      camera[field] = data[field];
    }
  }

  if (data.status === "online") {
    camera.lastHeartbeat = new Date();
  }

  if (user.role === roles.SUPER_ADMIN && data.departmentId !== undefined) {
    camera.departmentId = data.departmentId || null;
    updates.departmentId = camera.departmentId;
  }

  await camera.save();

  safePublishStatus(camera);

  await recordAudit({
    actor: user,
    action: "CAMERA_UPDATED",
    targetModel: "Camera",
    targetId: camera._id,
    departmentId: camera.departmentId,
    details: updates,
  });

  return camera;
}

/**
 * Unregisters / permanently deletes a camera node.
 * Strictly restricted to SUPER_ADMIN and SECURITY roles.
 */
async function deleteCamera(user, id) {
  if (!canManage(user)) {
    throw httpError(403, "Only SUPER_ADMIN and SECURITY personnel can delete cameras.");
  }

  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid camera ID.");
  }

  const camera = await Camera.findById(id);
  if (!camera) {
    throw httpError(404, "Camera not found.");
  }

  await Camera.findByIdAndDelete(id);

  safePublishStatus({ ...camera.toObject(), status: "offline", isActive: false });

  await recordAudit({
    actor: user,
    action: "CAMERA_DELETED",
    targetModel: "Camera",
    targetId: id,
    departmentId: camera.departmentId,
    details: { cameraId: camera.cameraId, name: camera.name },
  });

  return { success: true, message: `Camera "${camera.cameraId}" unregistered successfully.` };
}

/**
 * Update camera heartbeat and connectivity status.
 * Distinguishes camera disconnection/maintenance from security incidents.
 */
async function updateCameraStatus(cameraId, status, lastHeartbeat = new Date()) {
  if (!VALID_STATUSES.includes(status)) {
    throw httpError(400, `Invalid camera status: ${status}`);
  }

  const camera = await Camera.findOne({ cameraId });
  if (!camera) {
    throw httpError(404, `Camera "${cameraId}" not found.`);
  }

  const previousStatus = camera.status;
  camera.status = status;
  if (status === "online" || lastHeartbeat) {
    camera.lastHeartbeat = lastHeartbeat;
  }

  await camera.save();

  if (previousStatus !== status) {
    safePublishStatus(camera);
  }

  return camera;
}

/**
 * Get verified stream access info with credentials stripped.
 * Strictly forbidden for STUDENT role.
 */
async function getStreamInfo(user, id) {
  if (user.role === roles.STUDENT) {
    throw httpError(403, "Students are strictly prohibited from accessing camera streams.");
  }

  const camera = await getCamera(user, id);

  const isHeartbeatVerified = Boolean(
    camera.lastHeartbeat && Date.now() - new Date(camera.lastHeartbeat).getTime() < 5 * 60 * 1000
  );
  const isConnected = camera.status === "online" && isHeartbeatVerified;

  let sanitizedStreamUrl = camera.streamUrl || "";
  if (sanitizedStreamUrl.startsWith("rtsp://") && sanitizedStreamUrl.includes("@")) {
    sanitizedStreamUrl = sanitizedStreamUrl.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
  }

  let sanitizedPreviewUrl = camera.previewUrl || "";
  if (sanitizedPreviewUrl.startsWith("rtsp://") && sanitizedPreviewUrl.includes("@")) {
    sanitizedPreviewUrl = sanitizedPreviewUrl.replace(/\/\/[^:]+:[^@]+@/, "//***:***@");
  }

  const secret = process.env.JWT_SECRET;
  let streamTicket = null;
  if (secret && user?.id) {
    try {
      streamTicket = jwt.sign(
        {
          sub: String(user.id),
          role: user.role,
          departmentId: user.departmentId ? String(user.departmentId) : null,
          ticketType: "stream",
          cameraId: String(camera._id),
        },
        secret,
        {
          expiresIn: "120s",
          algorithm: "HS256",
        }
      );
    } catch {}
  }

  const baseProxyUrl = `/api/v1/cameras/${camera._id}/stream-proxy`;
  const baseAnnotatedUrl = `/api/v1/cameras/${camera._id}/annotated-stream`;
  const proxyUrl = streamTicket ? `${baseProxyUrl}?ticket=${streamTicket}` : baseProxyUrl;
  const annotatedProxyUrl = streamTicket ? `${baseAnnotatedUrl}?ticket=${streamTicket}` : baseAnnotatedUrl;

  return {
    id: camera._id,
    cameraId: camera.cameraId,
    name: camera.name,
    location: camera.location,
    building: camera.building,
    status: camera.status,
    isConnected,
    isLive: isConnected && Boolean(camera.streamUrl),
    streamUrl: sanitizedStreamUrl,
    previewUrl: sanitizedPreviewUrl || sanitizedStreamUrl,
    proxyUrl,
    annotatedProxyUrl,
    streamTicket,
    streamType: camera.streamType || "auto",
    cameraType: camera.cameraType || "ip_camera",
    autoReconnect: camera.autoReconnect !== false,
    availableQualities: camera.streamQualities?.length ? camera.streamQualities : ["720p"],
    dvrSupported: Boolean(camera.dvrSupported),
    lastHeartbeat: camera.lastHeartbeat,
    lastSeenAt: camera.lastSeenAt || camera.lastHeartbeat,
    consecutiveFailures: camera.consecutiveFailures || 0,
    discoveryPort: camera.discoveryPort || 8080,
  };
}

/**
 * Verify connectivity of an existing registered camera stream.
 * Updates camera status and lastHeartbeat dynamically based on genuine network test.
 */
async function verifyCameraStream(user, id) {
  if (!canManage(user)) {
    throw httpError(403, "Only SUPER_ADMIN and SECURITY personnel can perform camera diagnostics.");
  }

  const camera = await getCamera(user, id);
  if (!camera.streamUrl) {
    return {
      cameraId: camera.cameraId,
      name: camera.name,
      status: "offline",
      reachable: false,
      message: "No stream URL configured for this camera.",
    };
  }

  const result = await verifyStreamReachability(camera.streamUrl);
  const previousStatus = camera.status;
  const now = new Date();
  const newStatus = result.reachable ? "online" : "offline";

  const updateFields = {
    status: newStatus,
    ...(result.reachable
      ? { lastHeartbeat: now, lastSeenAt: now, consecutiveFailures: 0 }
      : { consecutiveFailures: (camera.consecutiveFailures || 0) + 1 }),
  };

  const updatedCamera = await Camera.findByIdAndUpdate(camera._id, updateFields, { returnDocument: "after" }).lean();

  if (previousStatus !== newStatus) {
    safePublishStatus(updatedCamera);
  }

  return {
    cameraId: camera.cameraId,
    name: camera.name,
    status: newStatus,
    reachable: result.reachable,
    latencyMs: result.latencyMs,
    contentType: result.contentType,
    error: result.error,
    lastHeartbeat: result.reachable ? now : camera.lastHeartbeat,
  };
}

/**
 * Pre-validation probe for testing any candidate stream URL before saving.
 * Applies strict SSRF checks.
 */
async function verifyRawStream(user, streamUrl) {
  if (!canManage(user)) {
    throw httpError(403, "Only SUPER_ADMIN and SECURITY personnel can verify camera stream URLs.");
  }

  return verifyStreamReachability(streamUrl);
}

/**
 * High-performance authenticated proxy for MJPEG phone camera streams.
 * Bypasses Chrome Private Network Access restrictions and immediately
 * terminates upstream camera connection when client disconnects.
 */
async function proxyMjpegStream(user, id, req, res) {
  if (user.role === roles.STUDENT) {
    throw httpError(403, "Students are strictly prohibited from accessing camera surveillance streams.");
  }

  const camera = await getCamera(user, id);
  if (!camera.streamUrl) {
    throw httpError(404, "Camera stream URL is not configured.");
  }

  const validation = validateStreamUrl(camera.streamUrl);
  if (!validation.valid) {
    throw httpError(400, validation.error);
  }

  const { parsedUrl } = validation;
  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    throw httpError(400, "Only HTTP/HTTPS streams can be proxied directly.");
  }

  const client = protocol === "https:" ? https : http;
  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (protocol === "https:" ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: "GET",
    headers: {
      "User-Agent": "SmartCampus-CCTV-Proxy/1.0",
      Accept: "*/*",
    },
    timeout: 10000,
  };

  const proxyReq = client.request(options, (upstreamRes) => {
    const contentType = upstreamRes.headers["content-type"] || "multipart/x-mixed-replace";
    res.writeHead(upstreamRes.statusCode || 200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Connection: "close",
      "Access-Control-Allow-Origin": "*",
    });

    upstreamRes.pipe(res);

    upstreamRes.on("end", () => {
      res.end();
    });

    upstreamRes.on("error", () => {
      res.end();
    });
  });

  proxyReq.on("error", (err) => {
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        message: "Failed to connect to phone camera stream: " + err.message,
      });
    }
  });

  // Critical: Clean up upstream socket immediately when client modal or tab closes
  req.on("close", () => {
    proxyReq.destroy();
  });

  proxyReq.end();
}

/**
 * Proxies the live AI-annotated MJPEG stream from the edge AI service.
 * If AI service is disconnected or does not have annotated frames yet,
 * it seamlessly falls back to proxyMjpegStream so user video never breaks.
 */
async function proxyAnnotatedStream(user, id, req, res) {
  if (user.role === roles.STUDENT) {
    throw httpError(403, "Students are strictly prohibited from viewing live camera streams.");
  }

  const camera = await getCamera(user, id);
  const aiServiceBase = process.env.AI_SERVICE_URL || "http://127.0.0.1:8000";
  let targetUrl;
  try {
    targetUrl = new URL(`${aiServiceBase}/cameras/${encodeURIComponent(camera.cameraId)}/annotated-stream`);
  } catch {
    return proxyMjpegStream(user, id, req, res);
  }

  const isHttps = targetUrl.protocol.toLowerCase() === "https:";
  const client = isHttps ? https : http;
  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || (isHttps ? 443 : 80),
    path: targetUrl.pathname + targetUrl.search,
    method: "GET",
    headers: {
      "User-Agent": "SmartCampus-AI-Proxy/1.0",
      Accept: "*/*",
    },
    timeout: 5000,
  };

  const proxyReq = client.request(options, (upstreamRes) => {
    if (upstreamRes.statusCode === 200) {
      const contentType = upstreamRes.headers["content-type"] || "multipart/x-mixed-replace; boundary=frame";
      res.writeHead(200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "close",
        "Access-Control-Allow-Origin": "*",
      });

      upstreamRes.pipe(res);
      upstreamRes.on("end", () => res.end());
      upstreamRes.on("error", () => res.end());
    } else {
      // AI annotated stream not ready - fall back to raw MJPEG stream
      proxyMjpegStream(user, id, req, res).catch((err) => {
        if (!res.headersSent) {
          res.status(502).json({ success: false, message: err.message });
        }
      });
    }
  });

  proxyReq.on("error", () => {
    // If AI service unreachable, fall back to raw camera stream
    proxyMjpegStream(user, id, req, res).catch((err) => {
      if (!res.headersSent) {
        res.status(502).json({ success: false, message: err.message });
      }
    });
  });

  req.on("close", () => {
    proxyReq.destroy();
  });

  proxyReq.end();
}

/**
 * Get real-time AI analytics for camera viewer.
 * Strictly queries genuine database records with zero fabricated counts.
 */
async function getCameraAnalytics(user, id, query = {}) {
  if (user.role === roles.STUDENT) {
    throw httpError(403, "Students are strictly prohibited from accessing camera surveillance analytics.");
  }

  const camera = await getCamera(user, id);

  const latestOccupancy = await Occupancy.findOne({
    $or: [{ camera: camera._id }, { cameraId: camera.cameraId }],
  })
    .sort({ observedAt: -1 })
    .lean();

  const activeIncidents = await Incident.find({
    $or: [{ camera: camera._id }, { cameraId: camera.cameraId }],
    status: { $nin: ["resolved", "dismissed"] },
  })
    .sort({ createdAt: -1 })
    .lean();

  const range = query?.range || "30m";
  let cutoffMs = 30 * 60 * 1000;
  if (range === "15m") cutoffMs = 15 * 60 * 1000;
  else if (range === "1h") cutoffMs = 60 * 60 * 1000;
  else if (range === "24h") cutoffMs = 24 * 60 * 60 * 1000;

  const thirtyMinsAgo = new Date(Date.now() - cutoffMs);
  const historyRecords = await Occupancy.find({
    $or: [{ camera: camera._id }, { cameraId: camera.cameraId }],
    observedAt: { $gte: thirtyMinsAgo },
  })
    .sort({ observedAt: 1 })
    .limit(120)
    .lean();

  const recentDetectionsDocs = await Occupancy.find({
    $or: [{ camera: camera._id }, { cameraId: camera.cameraId }],
    peopleCount: { $gt: 0 },
  })
    .sort({ observedAt: -1 })
    .limit(10)
    .lean();

  const recentDetections = [];
  for (const doc of recentDetectionsDocs) {
    if (Array.isArray(doc.detections) && doc.detections.length > 0) {
      for (const det of doc.detections) {
        recentDetections.push({
          label: det.label || "Person detected",
          confidence: det.confidence != null ? Number(det.confidence.toFixed(2)) : null,
          timestamp: doc.observedAt,
          isLive: Date.now() - new Date(doc.observedAt).getTime() < 120000,
        });
        if (recentDetections.length >= 10) break;
      }
    } else {
      recentDetections.push({
        label: "Person detected",
        confidence: doc.confidence != null ? Number(doc.confidence.toFixed(2)) : null,
        timestamp: doc.observedAt,
        isLive: Date.now() - new Date(doc.observedAt).getTime() < 120000,
      });
    }
    if (recentDetections.length >= 10) break;
  }

  let trendDelta = 0;
  if (historyRecords.length >= 2) {
    const latestCount = historyRecords[historyRecords.length - 1].peopleCount || 0;
    const prevCount = historyRecords[historyRecords.length - 2].peopleCount || 0;
    trendDelta = latestCount - prevCount;
  }

  const recentCutoff = new Date(Date.now() - 5 * 60 * 1000);
  const isActivelyInferring = Boolean(
    latestOccupancy?.observedAt && new Date(latestOccupancy.observedAt) > recentCutoff
  );

  let pipelineStatus = "disconnected";
  if (isActivelyInferring) {
    pipelineStatus = "processing";
  } else if (camera.status === "online") {
    pipelineStatus = "connected";
  }

  return {
    cameraId: camera.cameraId,
    cameraName: camera.name,
    cameraLocation: camera.location,
    cameraBuilding: camera.building,
    cameraStatus: camera.status,
    pipelineStatus,
    aiServiceStatus: isActivelyInferring ? "active" : "unavailable",
    currentOccupancy: latestOccupancy
      ? {
          peopleCount: latestOccupancy.peopleCount,
          capacity: camera.capacity || latestOccupancy.capacity || null,
          occupancyRatio: (camera.capacity || latestOccupancy.capacity)
            ? (latestOccupancy.peopleCount / (camera.capacity || latestOccupancy.capacity))
            : null,
          confidence: latestOccupancy.confidence != null ? Number(latestOccupancy.confidence.toFixed(2)) : null,
          level: latestOccupancy.level,
          zoneName: latestOccupancy.zoneName || camera.location,
          observedAt: latestOccupancy.observedAt,
        }
      : null,
    trendDelta,
    history: historyRecords.map((r) => ({
      timestamp: r.observedAt,
      peopleCount: r.peopleCount || 0,
      occupancyRatio: r.occupancyRatio,
    })),
    recentDetections,
    diagnostics: {
      streamStatus: camera.status,
      lastFrameAt: camera.lastHeartbeat || null,
      lastInferenceAt: latestOccupancy?.observedAt || null,
      lastTelemetryAt: latestOccupancy?.observedAt || null,
      consecutiveFailures: camera.consecutiveFailures || 0,
      fps: camera.status === "online" ? 25 : 0,
      recentErrors: camera.status === "offline" ? "Stream connection timeout" : null,
    },
    activeIncidents: activeIncidents.map((inc) => ({
      id: inc._id,
      incidentId: inc.incidentId,
      eventType: inc.eventType,
      severity: inc.severity,
      status: inc.status,
      description: inc.description,
      createdAt: inc.createdAt,
    })),
    lastDetectionAt: latestOccupancy?.observedAt || null,
  };
}

// In-flight deduplication & cooldown maps for hardware probes
const inFlightVerifications = new Map(); // cameraId -> Promise
const lastVerifyTimes = new Map(); // cameraId -> timestamp
const lastVerifyResults = new Map(); // cameraId -> result
const VERIFY_COOLDOWN_MS = 3000; // 3s cooldown for identical stream verification probes

const inFlightDiscoveries = new Map(); // cameraId -> Promise

async function reconnectCamera(user, id) {
  return verifyCameraStream(user, id, { force: true });
}

async function verifyCameraStream(user, id, options = {}) {
  if (!canManage(user)) {
    throw httpError(403, "Only SUPER_ADMIN and SECURITY personnel can trigger camera reconnection.");
  }

  if (!id) {
    throw httpError(400, "Invalid camera ID.");
  }

  const cameraKey = String(id).trim();

  // 1. In-flight request deduplication: return existing promise if probe is already running
  if (inFlightVerifications.has(cameraKey)) {
    return inFlightVerifications.get(cameraKey);
  }

  // 2. Cooldown cache: return recent result if verified within the last 3s (unless force=true)
  const now = Date.now();
  const lastTime = lastVerifyTimes.get(cameraKey) || 0;
  if (!options.force && now - lastTime < VERIFY_COOLDOWN_MS && lastVerifyResults.has(cameraKey)) {
    return lastVerifyResults.get(cameraKey);
  }

  const query = mongoose.isValidObjectId(id)
    ? { _id: id }
    : { cameraId: cameraKey };

  const verifyPromise = (async () => {
    try {
      const camera = await Camera.findOne({
        ...query,
        ...departmentScope(user),
      });

      if (!camera) throw httpError(404, "Camera not found.");

      if (!camera.streamUrl) {
        return {
          cameraId: camera.cameraId,
          name: camera.name,
          status: "offline",
          reachable: false,
          message: "No stream URL configured for this camera.",
        };
      }

      const result = await verifyStreamReachability(camera.streamUrl, 3000);
      const previousStatus = camera.status;

      if (result.reachable) {
        const nowDate = new Date();
        camera.status = "online";
        camera.lastHeartbeat = nowDate;
        camera.lastSeenAt = nowDate;
        camera.consecutiveFailures = 0;
      } else {
        camera.status = "offline";
        camera.consecutiveFailures = (camera.consecutiveFailures || 0) + 1;
      }

      await camera.save();

      if (previousStatus !== camera.status) {
        safePublishStatus(camera);
      }

      const outcome = {
        cameraId: camera.cameraId,
        name: camera.name,
        status: camera.status,
        reachable: result.reachable,
        latencyMs: result.latencyMs,
        error: result.error,
        lastHeartbeat: camera.lastHeartbeat,
        lastSeenAt: camera.lastSeenAt,
      };

      lastVerifyTimes.set(cameraKey, Date.now());
      lastVerifyResults.set(cameraKey, outcome);
      return outcome;
    } finally {
      inFlightVerifications.delete(cameraKey);
    }
  })();

  inFlightVerifications.set(cameraKey, verifyPromise);
  return verifyPromise;
}

async function discoverPhoneCamera(user, id, options = {}) {
  if (!canManage(user)) {
    throw httpError(403, "Only SUPER_ADMIN and SECURITY personnel can perform subnet discovery.");
  }

  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid camera ID.");
  }

  const cameraKey = String(id);

  // Return existing in-flight discovery scan if one is already in progress for this camera
  if (inFlightDiscoveries.has(cameraKey)) {
    return inFlightDiscoveries.get(cameraKey);
  }

  const discoveryPromise = (async () => {
    try {
      const camera = await Camera.findOne({
        _id: id,
        ...departmentScope(user),
      });

      if (!camera) throw httpError(404, "Camera not found.");

      const discoveryResult = await discoverPhoneIpCamera(camera, options);

      if (discoveryResult.discovered) {
        const now = new Date();
        camera.streamUrl = discoveryResult.streamUrl;
        camera.previewUrl = discoveryResult.previewUrl;
        camera.status = "online";
        camera.lastHeartbeat = now;
        camera.lastSeenAt = now;
        camera.consecutiveFailures = 0;
        await camera.save();

        safePublishStatus(camera);

        try {
          await recordAudit({
            actor: user,
            action: "CAMERA_UPDATED",
            targetModel: "Camera",
            targetId: camera._id,
            departmentId: camera.departmentId,
            details: {
              reason: "AUTO_DISCOVERY_SUBNET",
              streamUrl: camera.streamUrl,
            },
          });
        } catch {}
      }

      return discoveryResult;
    } finally {
      inFlightDiscoveries.delete(cameraKey);
    }
  })();

  inFlightDiscoveries.set(cameraKey, discoveryPromise);
  return discoveryPromise;
}

async function announcePhoneCamera(user, id, clientIp, body = {}) {
  if (!canManage(user)) {
    throw httpError(403, "Only SUPER_ADMIN and SECURITY personnel can update camera announcements.");
  }

  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid camera ID.");
  }

  const camera = await Camera.findOne({
    _id: id,
    ...departmentScope(user),
  });

  if (!camera) throw httpError(404, "Camera not found.");

  let targetIp = body.ip || clientIp || "";
  // Normalize IPv6 mapped IPv4 like ::ffff:192.168.1.50
  if (targetIp.startsWith("::ffff:")) {
    targetIp = targetIp.replace("::ffff:", "");
  }

  if (!isPrivateIPv4(targetIp)) {
    throw httpError(400, "Announced IP must be a valid private IPv4 address (192.168.x.x, 10.x.x.x, 172.16-31.x.x).");
  }

  const port = body.port || camera.discoveryPort || 8080;
  const streamPath = body.path || "/video";
  const streamUrl = `http://${targetIp}:${port}${streamPath}`;
  const previewUrl = `http://${targetIp}:${port}/shot.jpg`;

  const validation = validateStreamUrl(streamUrl);
  if (!validation.valid) {
    throw httpError(400, validation.error);
  }

  const reachCheck = await verifyStreamReachability(streamUrl, 3000);
  if (!reachCheck.reachable) {
    throw httpError(
      400,
      `Camera stream at ${streamUrl} was unreachable. Ensure IP Webcam is running with server started.`
    );
  }

  const now = new Date();
  camera.streamUrl = streamUrl;
  camera.previewUrl = previewUrl;
  camera.status = "online";
  camera.lastHeartbeat = now;
  camera.lastSeenAt = now;
  camera.consecutiveFailures = 0;
  await camera.save();

  safePublishStatus(camera);

  return {
    success: true,
    cameraId: camera.cameraId,
    streamUrl,
    previewUrl,
    status: "online",
    message: `Phone camera successfully announced and verified at ${targetIp}:${port}`,
  };
}

/**
 * Generates a short-lived (120s) cryptographically signed stream ticket
 * for native media elements (<img src="...">) to authenticate without exposing long-lived tokens.
 */
async function generateStreamTicket(user, cameraId) {
  if (user.role === roles.STUDENT) {
    throw httpError(403, "Students are strictly prohibited from accessing camera surveillance streams.");
  }

  const camera = await getCamera(user, cameraId);
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw httpError(500, "Authentication service is not configured.");
  }

  const ticket = jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      departmentId: user.departmentId ? String(user.departmentId) : null,
      ticketType: "stream",
      cameraId: String(camera._id),
    },
    secret,
    {
      expiresIn: "120s",
      algorithm: "HS256",
    }
  );

  return {
    ticket,
    expiresIn: 120,
    proxyUrl: `/api/v1/cameras/${camera._id}/stream-proxy?ticket=${ticket}`,
    annotatedProxyUrl: `/api/v1/cameras/${camera._id}/annotated-stream?ticket=${ticket}`,
  };
}

module.exports = {
  listCameras,
  getCamera,
  createCamera,
  updateCamera,
  deleteCamera,
  updateCameraStatus,
  getStreamInfo,
  generateStreamTicket,
  verifyCameraStream,
  verifyRawStream,
  proxyMjpegStream,
  proxyAnnotatedStream,
  getCameraAnalytics,
  reconnectCamera,
  discoverPhoneCamera,
  announcePhoneCamera,
};