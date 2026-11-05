const mongoose = require("mongoose");
const crypto = require("crypto");

const Incident = require("./incident.model");
const Camera = require("../cameras/camera.model");
const User = require("../users/user.model");
const { recordAudit } = require("../audit/audit.service");
const { createForUser } = require("../notifications/notification.service");
const {
  saveEvidenceImage,
  createEvidenceRecord,
  getEvidenceFilePath,
  sanitizeEvidenceForUser,
} = require("./evidence.service");
const { sendCrowdAlertEmail } = require("../notifications/email.service");
const { roles, incident: incidentConstants } = require("../../../shared/constants.json");

const VALID_TRANSITIONS = incidentConstants.transitions;
const VALID_EVENT_TYPES = incidentConstants.eventTypes;
const VALID_SEVERITIES = incidentConstants.severities;

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function scopeFor(user) {
  if (user.role === roles.SUPER_ADMIN || user.role === roles.SECURITY) return {};

  if (!user.departmentId) {
    return { departmentId: null };
  }

  return { departmentId: user.departmentId };
}

function safePublishIncident(incident) {
  try {
    const { publishIncidentCreated } = require("../../src/realtime/eventPublisher");
    publishIncidentCreated(incident);
  } catch {
    // Non-fatal if socket server not running in isolated test mode
  }
}

/**
 * Look up eligible notification & email recipients:
 * 1. Eligible Super Admin users
 * 2. Relevant department head(s) according to camera's department
 * 3. Fallback policy: if camera has no department, all active department heads are included
 * 4. Deduplicate recipients; never email students or faculty indiscriminately.
 */
async function getEligibleIncidentRecipients(camera) {
  const superAdmins = await User.find({
    role: roles.SUPER_ADMIN,
    isActive: true,
  })
    .select("name email role departmentId isActive")
    .lean();

  let deptHeads = [];
  if (camera?.departmentId) {
    deptHeads = await User.find({
      role: roles.DEPT_HEAD,
      departmentId: camera.departmentId,
      isActive: true,
    })
      .select("name email role departmentId isActive")
      .lean();
  } else {
    // Documented Fallback Policy:
    // If a camera has no department assignment (e.g. campus perimeter, outdoor common area),
    // the alert is campus-wide: notify all active DEPT_HEAD users alongside SUPER_ADMINs.
    deptHeads = await User.find({
      role: roles.DEPT_HEAD,
      isActive: true,
    })
      .select("name email role departmentId isActive")
      .lean();
  }

  const userMap = new Map();
  for (const u of [...superAdmins, ...deptHeads]) {
    if (
      u &&
      u.isActive &&
      u.email &&
      typeof u.email === "string" &&
      u.email.includes("@")
    ) {
      userMap.set(String(u._id), u);
    }
  }

  return Array.from(userMap.values());
}

async function listIncidents(user, filters = {}) {
  const query = { ...scopeFor(user) };

  if (filters.status) query.status = filters.status;
  if (filters.severity) query.severity = filters.severity;

  const limit = Math.min(Number(filters.limit) || 50, 100);

  const incidents = await Incident.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("camera", "name cameraId location building")
    .populate("assignedTo", "name email role")
    .lean();

  return incidents.map((inc) => ({
    ...inc,
    evidence: sanitizeEvidenceForUser(user, inc.evidence, inc._id),
  }));
}

async function getIncident(user, id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid incident ID.");
  }

  const incident = await Incident.findOne({
    _id: id,
    ...scopeFor(user),
  })
    .populate("camera", "name cameraId location building")
    .populate("assignedTo", "name email role")
    .lean();

  if (!incident) throw httpError(404, "Incident not found.");

  return {
    ...incident,
    evidence: sanitizeEvidenceForUser(user, incident.evidence, incident._id),
  };
}

async function createIncident(user, data) {
  if (![roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY].includes(user.role)) {
    throw httpError(403, "You do not have permission to report incidents.");
  }

  const cameraId = String(data.cameraId).trim();
  const cameraQuery = { cameraId, isActive: true };

  if (user.role !== roles.SUPER_ADMIN) {
    if (!user.departmentId) {
      throw httpError(403, "Department assignment is required.");
    }
    cameraQuery.departmentId = user.departmentId;
  }

  const camera = await Camera.findOne(cameraQuery);
  if (!camera) {
    throw httpError(404, `Accessible active camera "${cameraId}" not found.`);
  }

  if (!VALID_EVENT_TYPES.includes(data.eventType)) {
    throw httpError(400, `Invalid event type: ${data.eventType}`);
  }

  if (!VALID_SEVERITIES.includes(data.severity)) {
    throw httpError(400, `Invalid severity: ${data.severity}`);
  }

  const incident = await Incident.create({
    incidentId: crypto.randomUUID(),
    eventType: data.eventType,
    severity: data.severity,
    camera: camera._id,
    departmentId: camera.departmentId,
    description: String(data.description).trim(),
    confidence: data.confidence !== undefined ? Number(data.confidence) : 1.0,
    metadata: data.metadata || {},
    status: "new",
  });

  safePublishIncident(incident);

  await recordAudit({
    actor: user,
    action: "INCIDENT_CREATED",
    targetModel: "Incident",
    targetId: incident._id,
    departmentId: incident.departmentId,
    details: { eventType: incident.eventType, severity: incident.severity },
  });

  return incident;
}

/**
 * Ingest events from the AI edge service.
 * Handles crowd threshold breaches (people_count > threshold), deduplication,
 * evidence frame persistence, in-app dashboard notifications, and email notifications.
 */
async function createIncidentFromAI(payload) {
  if (!payload || typeof payload !== "object") {
    throw httpError(400, "Invalid AI event payload.");
  }

  const cameraId = payload.camera_id || payload.cameraId;
  let eventType = payload.event_type || payload.eventType;
  if (eventType === "crowd_gathering") {
    eventType = "crowd_overcrowding";
  }
  const severity = payload.severity || "info";

  if (!cameraId || !eventType) {
    throw httpError(400, "Camera ID and event type are required.");
  }

  if (!VALID_EVENT_TYPES.includes(eventType)) {
    throw httpError(400, `Invalid event type: ${eventType}`);
  }

  const camera = await Camera.findOne({
    cameraId,
    isActive: true,
  });

  if (!camera) {
    throw httpError(404, `Active camera "${cameraId}" not found.`);
  }

  camera.lastDetectionAt = new Date();
  camera.aiDetectionActive = true;
  await camera.save();

  const metadata = payload.metadata || {};
  const hasCount =
    payload.people_count !== undefined ||
    payload.peopleCount !== undefined ||
    metadata.people_count !== undefined ||
    metadata.peopleCount !== undefined;

  const peopleCount = hasCount
    ? Number(
        payload.people_count ??
          payload.peopleCount ??
          metadata.people_count ??
          metadata.peopleCount
      )
    : 5;
  const threshold = Number(
    payload.threshold ??
      metadata.threshold ??
      camera.crowdAlertThreshold ??
      4
  );

  // If payload contains people count, record occupancy observation
  if (hasCount) {
    try {
      const Occupancy = require("../occupancy/occupancy.model");
      const { calculateLevel } = require("../occupancy/occupancy.service");
      const { publishOccupancyUpdate } = require("../../src/realtime/eventPublisher");

      const count = peopleCount;
      const cap = Number(metadata.capacity || camera.capacity || 100);
      const ratio = cap > 0 ? Number((count / cap).toFixed(2)) : 0;

      const occRecord = await Occupancy.create({
        camera: camera._id,
        cameraId: camera.cameraId,
        zoneName: camera.location || "Campus Zone",
        departmentId: camera.departmentId,
        peopleCount: count,
        capacity: cap,
        occupancyRatio: ratio,
        level: calculateLevel(ratio),
        observedAt: new Date(),
      });

      publishOccupancyUpdate(occRecord);
    } catch {
      // Non-fatal if telemetry publishing fails
    }
  }

  // Section 1 Rule: 0-4 detected people do not trigger a crowd-count incident.
  // Trigger condition is strictly person_count > threshold (5 or more people for threshold 4).
  if (eventType === "crowd_overcrowding") {
    if (hasCount && peopleCount <= threshold) {
      if (camera.crowdAlertActive) {
        camera.crowdAlertActive = false;
        await camera.save();
        await Incident.updateMany(
          {
            camera: camera._id,
            eventType: "crowd_overcrowding",
            status: { $in: ["new", "acknowledged", "investigating"] },
          },
          {
            $set: {
              status: "resolved",
              resolvedAt: new Date(),
              resolutionNotes: `Condition cleared: people count dropped to ${peopleCount} (<= threshold ${threshold}).`,
            },
          }
        );
      }
      return {
        success: true,
        incidentCreated: false,
        reason: "below_threshold",
        deduplicated: true,
        incident: null,
        message: `People count (${peopleCount}) did not exceed threshold (${threshold}). No incident generated.`,
      };
    }

    // Atomic claim on camera.crowdAlertActive to guarantee concurrent deduplication
    const claimedCamera = await Camera.findOneAndUpdate(
      { _id: camera._id, crowdAlertActive: { $ne: true } },
      { $set: { crowdAlertActive: true } },
      { returnDocument: "after" }
    );

    if (!claimedCamera) {
      const existing = await Incident.findOne({
        camera: camera._id,
        eventType,
        status: { $in: ["new", "acknowledged", "investigating"] },
      }).sort({ createdAt: -1 });

      if (existing) {
        if (payload.confidence) {
          existing.confidence = Math.max(
            existing.confidence || 0,
            Number(payload.confidence)
          );
        }
        await existing.save();
      }

      return {
        success: true,
        incidentCreated: false,
        reason: "already_active",
        deduplicated: true,
        incident: existing,
        message: `Active crowd alert already exists for camera "${camera.cameraId}".`,
      };
    }
  }

  // Section 5 Requirement: Incident deduplication against existing active incidents
  const deduplicationThreshold = new Date(Date.now() - 5 * 60 * 1000);
  const existingActiveIncident = await Incident.findOne({
    camera: camera._id,
    eventType,
    status: { $in: ["new", "acknowledged", "investigating"] },
    $or: [
      { updatedAt: { $gte: deduplicationThreshold } },
      ...(eventType === "crowd_overcrowding" ? [{}] : []),
    ],
  }).sort({ createdAt: -1 });

  if (existingActiveIncident) {
    if (eventType === "crowd_overcrowding") {
      await Camera.updateOne({ _id: camera._id }, { $set: { crowdAlertActive: true } });
    }
    if (payload.confidence) {
      existingActiveIncident.confidence = Math.max(
        existingActiveIncident.confidence || 0,
        Number(payload.confidence)
      );
    }
    if (payload.metadata) {
      existingActiveIncident.metadata = {
        ...existingActiveIncident.metadata,
        ...payload.metadata,
        people_count: peopleCount,
        threshold,
      };
    }
    await existingActiveIncident.save();
    return {
      success: true,
      incidentCreated: false,
      reason: "already_active",
      incident: existingActiveIncident,
      deduplicated: true,
    };
  }

  // Process and store incident evidence frame
  const evidenceRecords = [];
  const imageBase64 =
    payload.imageBase64 ||
    payload.image_base64 ||
    metadata.imageBase64 ||
    metadata.image_base64;
  let savedStorageKey = null;

  if (imageBase64) {
    try {
      savedStorageKey = saveEvidenceImage(imageBase64, camera.cameraId);
      if (savedStorageKey) {
        evidenceRecords.push(
          createEvidenceRecord({
            storageKey: savedStorageKey,
            capturedAt: payload.timestamp || new Date(),
          })
        );
      }
    } catch (saveErr) {
      console.warn("Could not save evidence image:", saveErr.message);
    }
  }

  // Include string evidence paths if provided from screenshot burst
  if (Array.isArray(metadata.evidence)) {
    for (const item of metadata.evidence) {
      if (typeof item === "string" && item.trim()) {
        try {
          evidenceRecords.push(
            createEvidenceRecord({
              storageKey: item.trim(),
              capturedAt: payload.timestamp || new Date(),
            })
          );
        } catch {}
      }
    }
  }

  // Mark camera crowd alert condition active
  if (eventType === "crowd_overcrowding") {
    camera.crowdAlertActive = true;
    await camera.save();
  }

  const computedSeverity =
    eventType === "crowd_overcrowding"
      ? peopleCount >= threshold * 2
        ? "critical"
        : "high"
      : severity;

  const description =
    payload.message ||
    payload.description ||
    (eventType === "crowd_overcrowding"
      ? `People count threshold exceeded: ${peopleCount} detected (threshold: ${threshold}).`
      : "AI event requires review.");

  const capturedTimestamp = payload.timestamp || new Date().toISOString();

  const incident = await Incident.create({
    incidentId: crypto.randomUUID(),
    eventType,
    severity: computedSeverity,
    camera: camera._id,
    departmentId: camera.departmentId,
    description,
    confidence: payload.confidence !== undefined ? Number(payload.confidence) : null,
    capturedAt: new Date(capturedTimestamp),
    metadata: {
      ...payload.metadata,
      people_count: peopleCount,
      threshold,
      cameraName: camera.name,
      cameraId: camera.cameraId,
      location: camera.location,
      building: camera.building || "",
      timezone: "Asia/Kolkata",
      capturedAt: capturedTimestamp,
    },
    evidence: evidenceRecords,
    status: "new",
    emailStatus: "pending",
  });

  // Look up eligible notification and email recipients
  const recipients = await getEligibleIncidentRecipients(camera);

  // 1. In-app Dashboard notifications
  for (const recipientUser of recipients) {
    try {
      await createForUser({
        recipient: recipientUser._id,
        type: "incident_created",
        title: `[Campus Alert] People Count Threshold Exceeded — ${camera.cameraId}`,
        message: `Camera ${camera.name} (${camera.cameraId}) in ${camera.location} detected ${peopleCount} people (threshold: ${threshold}).`,
        resourceId: incident._id,
        resourceType: "Incident",
      });
    } catch (notifErr) {
      console.warn("Could not dispatch user notification:", notifErr.message);
    }
  }

  // 2. Email delivery
  const recipientEmails = Array.from(
    new Set(recipients.map((u) => u.email).filter(Boolean))
  );

  const evidenceFilePath = savedStorageKey ? getEvidenceFilePath(savedStorageKey) : null;
  const emailResult = await sendCrowdAlertEmail({
    camera,
    incident,
    peopleCount,
    threshold,
    capturedAt: capturedTimestamp,
    evidenceFilePath,
    recipients: recipientEmails,
  });

  incident.emailStatus = emailResult.status || (emailResult.success ? "sent" : "failed");
  incident.emailSentAt = emailResult.sentAt || null;
  incident.emailError = emailResult.error || null;
  incident.emailRecipients = recipientEmails;
  await incident.save();

  // Populate camera object on incident before publishing so dashboard gets full camera details
  const populatedIncident = await Incident.findById(incident._id)
    .populate("camera", "name cameraId location building")
    .lean();

  safePublishIncident(populatedIncident || incident);

  return { success: true, incidentCreated: true, incident, deduplicated: false };
}

async function updateStatus(user, id, nextStatus) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid incident ID.");
  }

  const incident = await Incident.findOne({
    _id: id,
    ...scopeFor(user),
  });

  if (!incident) throw httpError(404, "Incident not found.");

  const allowed = VALID_TRANSITIONS[incident.status] || [];

  if (!allowed.includes(nextStatus)) {
    throw httpError(
      409,
      `Cannot transition incident from "${incident.status}" to "${nextStatus}".`
    );
  }

  const previousStatus = incident.status;
  incident.status = nextStatus;

  if (nextStatus === "acknowledged") {
    incident.acknowledgedAt = new Date();
  } else if (nextStatus === "resolved") {
    incident.resolvedAt = new Date();
  } else if (nextStatus === "dismissed") {
    incident.dismissedAt = new Date();
  }

  await incident.save();

  await recordAudit({
    actor: user,
    action: "INCIDENT_STATUS_UPDATED",
    targetModel: "Incident",
    targetId: incident._id,
    departmentId: incident.departmentId,
    details: { previousStatus, newStatus: nextStatus },
  });

  try {
    const { publishIncidentUpdated } = require("../../src/realtime/eventPublisher");
    publishIncidentUpdated(incident);
  } catch {
    // Non-fatal if publisher offline
  }

  return incident;
}

async function assignIncident(user, id, assignedTo) {
  if (!mongoose.isValidObjectId(id) || !mongoose.isValidObjectId(assignedTo)) {
    throw httpError(400, "Invalid incident or assigned user ID.");
  }

  const incident = await Incident.findOne({
    _id: id,
    ...scopeFor(user),
  });

  if (!incident) throw httpError(404, "Incident not found.");

  const targetUser = await User.findOne({
    _id: assignedTo,
    isActive: true,
    role: { $in: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY] },
  });

  if (!targetUser) {
    throw httpError(400, "Assigned user must be an active staff member.");
  }

  if (
    user.role !== roles.SUPER_ADMIN &&
    String(targetUser.departmentId) !== String(user.departmentId)
  ) {
    throw httpError(403, "Cannot assign an incident outside your department.");
  }

  incident.assignedTo = targetUser._id;
  await incident.save();

  try {
    await createForUser({
      recipient: targetUser._id,
      type: "incident_assigned",
      title: "New Incident Assigned",
      message: `You have been assigned to incident: ${incident.description.slice(0, 80)}`,
      resourceId: incident._id,
      resourceType: "Incident",
    });
  } catch (err) {
    console.warn("Could not dispatch assignment notification:", err.message);
  }

  await recordAudit({
    actor: user,
    action: "INCIDENT_ASSIGNED",
    targetModel: "Incident",
    targetId: incident._id,
    departmentId: incident.departmentId,
    details: { assignedTo: targetUser._id },
  });

  try {
    const { publishIncidentUpdated } = require("../../src/realtime/eventPublisher");
    publishIncidentUpdated(incident);
  } catch {
    // Non-fatal if publisher offline
  }

  return incident;
}

async function retryIncidentEmail(user, id) {
  if (![roles.SUPER_ADMIN, roles.DEPT_HEAD].includes(user.role)) {
    throw httpError(403, "You do not have permission to retry email delivery.");
  }

  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid incident ID.");
  }

  const incident = await Incident.findOne({
    _id: id,
    ...scopeFor(user),
  }).populate("camera");

  if (!incident) throw httpError(404, "Incident not found.");
  if (!incident.camera) throw httpError(404, "Associated camera not found.");

  const recipients = await getEligibleIncidentRecipients(incident.camera);
  const recipientEmails = Array.from(
    new Set(recipients.map((u) => u.email).filter(Boolean))
  );

  const peopleCount = Number(
    incident.metadata?.people_count ?? incident.metadata?.peopleCount ?? 0
  );
  const threshold = Number(
    incident.metadata?.threshold ?? incident.camera.crowdAlertThreshold ?? 4
  );

  let evidenceFilePath = null;
  if (Array.isArray(incident.evidence) && incident.evidence.length > 0) {
    const key = incident.evidence[0].storageKey;
    evidenceFilePath = getEvidenceFilePath(key);
  }

  const emailResult = await sendCrowdAlertEmail({
    camera: incident.camera,
    incident,
    peopleCount,
    threshold,
    capturedAt: incident.metadata?.capturedAt || incident.createdAt,
    evidenceFilePath,
    recipients: recipientEmails,
  });

  incident.emailStatus = emailResult.status || (emailResult.success ? "sent" : "failed");
  incident.emailSentAt = emailResult.sentAt || null;
  incident.emailError = emailResult.error || null;
  incident.emailRecipients = recipientEmails;
  await incident.save();

  await recordAudit({
    actor: user,
    action: "INCIDENT_EMAIL_RETRIED",
    targetModel: "Incident",
    targetId: incident._id,
    departmentId: incident.departmentId,
    details: {
      emailStatus: incident.emailStatus,
      recipients: recipientEmails,
      error: incident.emailError,
    },
  });

  return incident;
}

module.exports = {
  listIncidents,
  getIncident,
  createIncident,
  createIncidentFromAI,
  updateStatus,
  assignIncident,
  retryIncidentEmail,
  getEligibleIncidentRecipients,
};