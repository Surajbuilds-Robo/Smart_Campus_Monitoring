/**
 * Campus Operational Calculations & Formatting Helpers
 * Aligned with shared/constants.json and backend contract rules
 */

/**
 * Computes safe percentage value preventing division-by-zero
 * @param {number} occupied
 * @param {number} capacity
 * @returns {number}
 */
export function computePercentage(occupied, capacity) {
  const cap = Number(capacity);
  const occ = Number(occupied);

  if (!cap || isNaN(cap) || cap <= 0) {
    return 0;
  }

  const safeOcc = isNaN(occ) || occ < 0 ? 0 : occ;
  return Math.min(100, Math.round((safeOcc / cap) * 100));
}

/**
 * Categorizes crowd occupancy status based on 70% warning and 90% critical rules
 * @param {number} ratioOrPercentage - Value as 0.0-1.0 ratio or 0-100 percentage
 * @returns {{ label: string, variant: string, color: string, level: string }}
 */
export function getCrowdStatus(ratioOrPercentage) {
  const num = Number(ratioOrPercentage);
  if (isNaN(num) || num < 0) {
    return { label: 'Normal Traffic', variant: 'success', color: '#10B981', level: 'normal' };
  }

  // Normalize: if value <= 1, treat as ratio; otherwise treat as percentage
  const percentage = num <= 1 && num > 0 ? num * 100 : num;

  if (percentage >= 90) {
    return { label: 'Critical Density', variant: 'danger', color: '#EF4444', level: 'critical' };
  }
  if (percentage >= 70) {
    return { label: 'Crowded Area', variant: 'warning', color: '#F59E0B', level: 'warning' };
  }
  return { label: 'Normal Traffic', variant: 'success', color: '#10B981', level: 'normal' };
}

/**
 * Returns color token for incident severity
 * @param {string} severity
 * @returns {string}
 */
export function getSeverityColor(severity) {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return '#DC2626';
    case 'high':
      return '#EA580C';
    case 'warning':
      return '#D97706';
    case 'info':
    default:
      return '#2563EB';
  }
}

/**
 * Returns color token for incident lifecycle status
 * @param {string} status
 * @returns {string}
 */
export function getStatusColor(status) {
  switch (status?.toLowerCase()) {
    case 'new':
      return '#DC2626';
    case 'acknowledged':
      return '#2563EB';
    case 'investigating':
      return '#7C3AED';
    case 'resolved':
      return '#059669';
    case 'dismissed':
    default:
      return '#64748B';
  }
}

/**
 * Human-readable label for incident event type
 * @param {string} type
 * @returns {string}
 */
export function formatIncidentEventType(type) {
  switch (type) {
    case 'crowd_overcrowding':
      return 'Crowd Overcrowding';
    case 'parking_violation':
      return 'Parking Space Violation';
    case 'fall':
      return 'Person Fall Anomaly';
    case 'violence':
      return 'Physical Altercation';
    case 'other':
      return 'Operational Anomaly';
    default:
      return type ? type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'Campus Anomaly';
  }
}

/**
 * State machine transitions contract according to shared/constants.json
 */
export const INCIDENT_TRANSITIONS = {
  new: ['acknowledged', 'dismissed'],
  acknowledged: ['investigating', 'resolved', 'dismissed'],
  investigating: ['resolved', 'dismissed'],
  resolved: [],
  dismissed: [],
};

/**
 * Returns allowed next statuses from current incident status
 * @param {string} currentStatus
 * @returns {string[]}
 */
export function getPermittedTransitions(currentStatus) {
  return INCIDENT_TRANSITIONS[currentStatus] || [];
}

/**
 * Validates whether an incident status transition is permitted
 * @param {string} currentStatus
 * @param {string} nextStatus
 * @returns {boolean}
 */
export function canTransitionIncident(currentStatus, nextStatus) {
  const allowed = getPermittedTransitions(currentStatus);
  return allowed.includes(nextStatus);
}

/**
 * Formats a date timestamp into a readable mobile string
 * @param {string|Date} dateVal
 * @returns {string}
 */
export function formatTimestamp(dateVal) {
  if (!dateVal) return 'Unknown';
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return 'Invalid date';
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown';
  }
}

export default {
  computePercentage,
  getCrowdStatus,
  getSeverityColor,
  getStatusColor,
  formatIncidentEventType,
  INCIDENT_TRANSITIONS,
  getPermittedTransitions,
  canTransitionIncident,
  formatTimestamp,
};
