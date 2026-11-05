/**
 * Event Payload Validation Utilities
 * Validates incoming Socket.IO events to ensure state integrity and prevent UI crashes
 */

const CAMERA_STATUSES = new Set(['online', 'offline', 'maintenance']);
const INCIDENT_STATUSES = new Set(['new', 'acknowledged', 'investigating', 'resolved', 'dismissed']);
const INCIDENT_SEVERITIES = new Set(['info', 'warning', 'high', 'critical']);

/**
 * Validates camera:status payload
 * @param {object} payload
 * @returns {object|null}
 */
export function validateCameraStatusPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const id = payload.id ? String(payload.id) : null;
  const cameraId = payload.cameraId ? String(payload.cameraId) : id;
  const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : null;

  if (!cameraId || !CAMERA_STATUSES.has(status)) {
    return null;
  }

  return {
    id: id || cameraId,
    cameraId,
    status,
    lastHeartbeat: payload.lastHeartbeat || new Date().toISOString(),
  };
}

/**
 * Validates parking:updated payload
 * @param {object} payload
 * @returns {object|null}
 */
export function validateParkingPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const id = payload.id ? String(payload.id) : null;
  const zoneId = payload.zoneId ? String(payload.zoneId) : id;

  if (!zoneId) return null;

  const totalSpaces = Number(payload.totalSpaces);
  const occupiedSpaces = Number(payload.occupiedSpaces);
  const availableSpaces =
    payload.availableSpaces !== undefined
      ? Number(payload.availableSpaces)
      : !isNaN(totalSpaces) && !isNaN(occupiedSpaces)
      ? Math.max(0, totalSpaces - occupiedSpaces)
      : null;

  if (isNaN(totalSpaces) || totalSpaces < 0 || isNaN(occupiedSpaces) || occupiedSpaces < 0) {
    return null;
  }

  return {
    id: id || zoneId,
    zoneId,
    name: payload.name || `Zone ${zoneId}`,
    location: payload.location || '',
    building: payload.building || '',
    totalSpaces,
    occupiedSpaces,
    availableSpaces: availableSpaces !== null && !isNaN(availableSpaces) ? availableSpaces : 0,
    status: payload.status || (occupiedSpaces >= totalSpaces ? 'full' : 'available'),
    lastUpdatedAt: payload.lastUpdatedAt || new Date().toISOString(),
  };
}

/**
 * Validates occupancy:updated payload
 * @param {object} payload
 * @returns {object|null}
 */
export function validateOccupancyPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const id = payload.id ? String(payload.id) : null;
  const zoneName = payload.zoneName ? String(payload.zoneName) : (payload.cameraId ? String(payload.cameraId) : null);

  if (!zoneName && !id) return null;

  const peopleCount = Number(payload.peopleCount);
  const capacity = Number(payload.capacity);

  if (isNaN(peopleCount) || peopleCount < 0 || isNaN(capacity) || capacity < 0) {
    return null;
  }

  const occupancyRatio =
    payload.occupancyRatio !== undefined && !isNaN(Number(payload.occupancyRatio))
      ? Number(payload.occupancyRatio)
      : capacity > 0
      ? peopleCount / capacity
      : 0;

  let level = payload.level;
  if (!level) {
    if (occupancyRatio >= 0.9) level = 'critical';
    else if (occupancyRatio >= 0.7) level = 'warning';
    else level = 'normal';
  }

  return {
    id: id || zoneName,
    cameraId: payload.cameraId || null,
    zoneName: zoneName || 'Campus Zone',
    peopleCount,
    capacity,
    occupancyRatio,
    level,
    observedAt: payload.observedAt || new Date().toISOString(),
  };
}

/**
 * Validates incident:created payload
 * @param {object} payload
 * @returns {object|null}
 */
export function validateIncidentCreatedPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const id = payload.id ? String(payload.id) : (payload.incidentId ? String(payload.incidentId) : null);
  const incidentId = payload.incidentId ? String(payload.incidentId) : id;

  if (!id && !incidentId) return null;

  const severity = typeof payload.severity === 'string' ? payload.severity.toLowerCase() : 'warning';
  const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : 'new';

  return {
    id: id || incidentId,
    incidentId: incidentId || id,
    eventType: payload.eventType || 'other',
    severity: INCIDENT_SEVERITIES.has(severity) ? severity : 'warning',
    status: INCIDENT_STATUSES.has(status) ? status : 'new',
    camera: payload.camera || null,
    createdAt: payload.createdAt || new Date().toISOString(),
  };
}

/**
 * Validates incident:updated payload
 * @param {object} payload
 * @returns {object|null}
 */
export function validateIncidentUpdatedPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const id = payload.id ? String(payload.id) : (payload.incidentId ? String(payload.incidentId) : null);
  const incidentId = payload.incidentId ? String(payload.incidentId) : id;

  if (!id && !incidentId) return null;

  const status = typeof payload.status === 'string' ? payload.status.toLowerCase() : null;
  if (status && !INCIDENT_STATUSES.has(status)) {
    return null;
  }

  return {
    id: id || incidentId,
    incidentId: incidentId || id,
    eventType: payload.eventType || undefined,
    severity: payload.severity || undefined,
    status: status || undefined,
    assignedTo: payload.assignedTo || undefined,
    updatedAt: payload.updatedAt || new Date().toISOString(),
  };
}

/**
 * Validates notification:created payload
 * @param {object} payload
 * @returns {object|null}
 */
export function validateNotificationPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;

  const id = payload.id ? String(payload.id) : (payload._id ? String(payload._id) : null);
  if (!id) return null;

  return {
    id,
    type: payload.type || 'system_alert',
    title: payload.title || 'Campus Alert',
    message: payload.message || '',
    resourceId: payload.resourceId ? String(payload.resourceId) : null,
    resourceType: payload.resourceType || null,
    readAt: payload.readAt || null,
    createdAt: payload.createdAt || new Date().toISOString(),
  };
}

export default {
  validateCameraStatusPayload,
  validateParkingPayload,
  validateOccupancyPayload,
  validateIncidentCreatedPayload,
  validateIncidentUpdatedPayload,
  validateNotificationPayload,
};
