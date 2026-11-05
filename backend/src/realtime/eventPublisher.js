const { socketEvents, roles } = require("../../../shared/constants.json");

let ioInstance = null;

function initializePublisher(io) {
  ioInstance = io;
}

function getIO() {
  return ioInstance;
}

function publishToUser(userId, eventName, payload) {
  const io = getIO();
  if (!io || !userId || !eventName || !payload) return false;

  io.to(`user:${userId}`).emit(eventName, payload);
  return true;
}

function publishToDepartment(departmentId, eventName, payload) {
  const io = getIO();
  if (!io || !departmentId || !eventName || !payload) return false;

  io.to(`department:${departmentId}`).emit(eventName, payload);
  return true;
}

function publishToRole(role, eventName, payload) {
  const io = getIO();
  if (!io || !role || !eventName || !payload) return false;

  io.to(`role:${role}`).emit(eventName, payload);
  return true;
}

function publishIncidentCreated(incident) {
  const io = getIO();
  if (!io || !incident) return false;

  const camObj =
    incident.camera && typeof incident.camera === "object"
      ? {
          _id: String(incident.camera._id || incident.camera.id || ""),
          cameraId: incident.camera.cameraId || String(incident.camera),
          name: incident.camera.name || incident.camera.cameraId || "Campus Camera",
          location: incident.camera.location || "",
          building: incident.camera.building || "",
        }
      : incident.camera
      ? { cameraId: String(incident.camera), name: String(incident.camera) }
      : null;

  const payload = {
    id: String(incident._id || incident.id || ""),
    incidentId: incident.incidentId,
    eventType: incident.eventType,
    severity: incident.severity,
    status: incident.status,
    camera: camObj || (incident.camera ? String(incident.camera) : null),
    cameraId:
      incident.camera?.cameraId ||
      incident.cameraId ||
      (typeof incident.camera === "string" ? incident.camera : null),
    cameraName: incident.camera?.name || incident.cameraName || null,
    location:
      incident.camera?.location ||
      incident.location ||
      incident.metadata?.location ||
      null,
    building:
      incident.camera?.building ||
      incident.building ||
      incident.metadata?.building ||
      null,
    peopleCount:
      incident.metadata?.people_count ?? incident.metadata?.peopleCount ?? null,
    threshold: incident.metadata?.threshold ?? null,
    description: incident.description,
    evidence: incident.evidence || [],
    metadata: incident.metadata || {},
    createdAt: incident.createdAt,
  };

  if (incident.departmentId) {
    publishToDepartment(
      String(incident.departmentId),
      socketEvents.incidentCreated,
      payload
    );
  }

  publishToRole(roles.SUPER_ADMIN, socketEvents.incidentCreated, payload);
  if (roles.SECURITY) {
    publishToRole(roles.SECURITY, socketEvents.incidentCreated, payload);
  }
  return true;
}

function publishIncidentUpdated(incident) {
  const io = getIO();
  if (!io || !incident) return false;

  const payload = {
    id: String(incident._id || incident.id),
    incidentId: incident.incidentId,
    eventType: incident.eventType,
    severity: incident.severity,
    status: incident.status,
    assignedTo: incident.assignedTo
      ? String(incident.assignedTo._id || incident.assignedTo)
      : null,
    updatedAt: incident.updatedAt,
  };

  if (incident.departmentId) {
    publishToDepartment(
      String(incident.departmentId),
      socketEvents.incidentUpdated,
      payload
    );
  }

  publishToRole(roles.SUPER_ADMIN, socketEvents.incidentUpdated, payload);
  if (roles.SECURITY) {
    publishToRole(roles.SECURITY, socketEvents.incidentUpdated, payload);
  }
  return true;
}

function publishCameraStatus(camera) {
  const io = getIO();
  if (!io || !camera) return false;

  const payload = {
    id: String(camera._id || camera.id),
    cameraId: camera.cameraId,
    status: camera.status,
    lastHeartbeat: camera.lastHeartbeat || null,
  };

  if (camera.departmentId) {
    publishToDepartment(
      String(camera.departmentId),
      socketEvents.cameraStatus,
      payload
    );
  }

  publishToRole(roles.SUPER_ADMIN, socketEvents.cameraStatus, payload);
  if (roles.SECURITY) {
    publishToRole(roles.SECURITY, socketEvents.cameraStatus, payload);
  }
  return true;
}

function publishOccupancyUpdate(record) {
  const io = getIO();
  if (!io || !record) return false;

  const payload = {
    id: String(record._id || record.id),
    camera: String(record.camera?._id || record.camera || ""),
    cameraId: record.cameraId,
    zoneName: record.zoneName,
    peopleCount: record.peopleCount,
    capacity: record.capacity,
    occupancyRatio: record.occupancyRatio,
    level: record.level,
    confidence: record.confidence != null ? Number(record.confidence.toFixed(2)) : null,
    detections: Array.isArray(record.detections) ? record.detections : [],
    observedAt: record.observedAt,
  };

  if (record.departmentId) {
    publishToDepartment(
      String(record.departmentId),
      socketEvents.occupancyUpdated,
      payload
    );
  }

  publishToRole(roles.SUPER_ADMIN, socketEvents.occupancyUpdated, payload);
  if (roles.SECURITY) {
    publishToRole(roles.SECURITY, socketEvents.occupancyUpdated, payload);
  }
  publishToRole(roles.DEPT_HEAD, socketEvents.occupancyUpdated, payload);
  publishToRole(roles.FACULTY, socketEvents.occupancyUpdated, payload);

  // If public campus zone, safe availability update is broadcast to all students (internal camera ID stripped)
  if (!record.departmentId) {
    publishToRole(roles.STUDENT, socketEvents.occupancyUpdated, {
      id: payload.id,
      zoneName: payload.zoneName,
      peopleCount: payload.peopleCount,
      capacity: payload.capacity,
      occupancyRatio: payload.occupancyRatio,
      level: payload.level,
      observedAt: payload.observedAt,
    });
  }

  return true;
}

function publishParkingUpdate(parking) {
  const io = getIO();
  if (!io || !parking) return false;

  const payload = {
    id: String(parking._id || parking.id),
    zoneId: parking.zoneId,
    name: parking.name,
    location: parking.location,
    building: parking.building || "",
    totalSpaces: parking.totalSpaces,
    occupiedSpaces: parking.occupiedSpaces,
    availableSpaces: parking.availableSpaces,
    status: parking.status,
    lastUpdatedAt: parking.lastUpdatedAt,
  };

  // Broadcast parking availability to all connected campus roles
  io.emit(socketEvents.parkingUpdated, payload);
  return true;
}

function publishNotification(notification) {
  const io = getIO();
  if (!io || !notification || !notification.recipient) return false;

  const payload = {
    id: String(notification._id || notification.id),
    type: notification.type,
    title: notification.title,
    message: notification.message,
    resourceId: notification.resourceId ? String(notification.resourceId) : null,
    resourceType: notification.resourceType || null,
    readAt: notification.readAt || null,
    createdAt: notification.createdAt,
  };

  // Strictly deliver to private recipient user room
  publishToUser(String(notification.recipient), socketEvents.notificationCreated, payload);
  return true;
}

module.exports = {
  initializePublisher,
  getIO,
  publishToUser,
  publishToDepartment,
  publishToRole,
  publishIncidentCreated,
  publishIncidentUpdated,
  publishCameraStatus,
  publishOccupancyUpdate,
  publishParkingUpdate,
  publishNotification,
};