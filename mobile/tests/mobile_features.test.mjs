import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ROLES } from '../constants/roles.js';
import {
  isStaff,
  isAdmin,
  isStudent,
  canAccessRoute,
} from '../constants/permissions.js';
import {
  computePercentage,
  getCrowdStatus,
  getSeverityColor,
  getStatusColor,
  formatIncidentEventType,
  getPermittedTransitions,
  INCIDENT_TRANSITIONS,
} from '../utils/calculations.js';

describe('Mobile Step 3 — Parking Calculations & Data Contracts', () => {
  it('safely computes parking capacity and percentages without division by zero', () => {
    assert.equal(computePercentage(0, 0), 0);
    assert.equal(computePercentage(50, 0), 0);
    assert.equal(computePercentage(0, 100), 0);
    assert.equal(computePercentage(75, 100), 75);
    assert.equal(computePercentage(-5, 100), 0);
    assert.equal(computePercentage(150, 100), 100, 'Caps percentage at 100%');
  });

  it('accurately aggregates totals across multiple parking lots', () => {
    const mockLots = [
      { name: 'North Visitor Lot', totalSpaces: 120, occupiedSpaces: 52, availableSpaces: 68 },
      { name: 'Faculty Deck', totalSpaces: 200, occupiedSpaces: 184, availableSpaces: 16 },
      { name: 'Student Structure', totalSpaces: 350, occupiedSpaces: 110, availableSpaces: 240 },
    ];

    const totalCapacity = mockLots.reduce((sum, p) => sum + p.totalSpaces, 0);
    const totalOccupied = mockLots.reduce((sum, p) => sum + p.occupiedSpaces, 0);
    const totalAvailable = mockLots.reduce((sum, p) => sum + p.availableSpaces, 0);

    assert.equal(totalCapacity, 670);
    assert.equal(totalOccupied, 346);
    assert.equal(totalAvailable, 324);
    assert.equal(totalOccupied + totalAvailable, totalCapacity);

    const overallPct = computePercentage(totalOccupied, totalCapacity);
    assert.equal(overallPct, 52);
  });
});

describe('Mobile Step 3 — Occupancy Metrics & Threshold Rules', () => {
  it('correctly maps crowd density status according to 70% and 90% rules', () => {
    // Normal (<70%)
    const normalReading = getCrowdStatus(0.58);
    assert.equal(normalReading.level, 'normal');
    assert.equal(normalReading.color, '#10B981');

    // Warning (>=70% and <90%)
    const warningReading = getCrowdStatus(0.70);
    assert.equal(warningReading.level, 'warning');
    assert.equal(warningReading.color, '#F59E0B');

    const warningReading2 = getCrowdStatus(86);
    assert.equal(warningReading2.level, 'warning');

    // Critical (>=90%)
    const criticalReading = getCrowdStatus(0.92);
    assert.equal(criticalReading.level, 'critical');
    assert.equal(criticalReading.color, '#EF4444');

    const criticalReading2 = getCrowdStatus(95);
    assert.equal(criticalReading2.level, 'critical');
  });

  it('handles missing or invalid occupancy values safely', () => {
    assert.equal(getCrowdStatus(null).level, 'normal');
    assert.equal(getCrowdStatus(undefined).level, 'normal');
    assert.equal(getCrowdStatus(-10).level, 'normal');
  });
});

describe('Mobile Step 3 — Incident State Machine Transitions & Formatting', () => {
  it('verifies incident state machine permitted forward transitions', () => {
    // From new
    const fromNew = getPermittedTransitions('new');
    assert.deepEqual(fromNew, ['acknowledged', 'dismissed']);

    // From acknowledged
    const fromAck = getPermittedTransitions('acknowledged');
    assert.deepEqual(fromAck, ['investigating', 'resolved', 'dismissed']);

    // From investigating
    const fromInv = getPermittedTransitions('investigating');
    assert.deepEqual(fromInv, ['resolved', 'dismissed']);
  });

  it('enforces terminal states for resolved and dismissed incidents', () => {
    assert.equal(getPermittedTransitions('resolved').length, 0, 'Resolved is terminal');
    assert.equal(getPermittedTransitions('dismissed').length, 0, 'Dismissed is terminal');
  });

  it('formats incident event types into human-readable mobile labels', () => {
    assert.equal(formatIncidentEventType('crowd_overcrowding'), 'Crowd Overcrowding');
    assert.equal(formatIncidentEventType('parking_violation'), 'Parking Space Violation');
    assert.equal(formatIncidentEventType('fall'), 'Person Fall Anomaly');
    assert.equal(formatIncidentEventType('violence'), 'Physical Altercation');
    assert.equal(formatIncidentEventType('other'), 'Operational Anomaly');
  });

  it('provides distinct semantic colors for status and severity', () => {
    assert.equal(getSeverityColor('critical'), '#DC2626');
    assert.equal(getSeverityColor('warning'), '#D97706');
    assert.equal(getSeverityColor('info'), '#2563EB');

    assert.equal(getStatusColor('new'), '#DC2626');
    assert.equal(getStatusColor('acknowledged'), '#2563EB');
    assert.equal(getStatusColor('investigating'), '#7C3AED');
    assert.equal(getStatusColor('resolved'), '#059669');
    assert.equal(getStatusColor('dismissed'), '#64748B');
  });
});

describe('Mobile Step 3 — Role-Based Feature Access & Privacy Gating', () => {
  it('permits students only to public parking and crowd occupancy', () => {
    assert.equal(canAccessRoute(ROLES.STUDENT, 'parking'), true);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'occupancy'), true);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'app/parking'), true);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'app/occupancy'), true);

    // Strictly forbidden
    assert.equal(canAccessRoute(ROLES.STUDENT, 'cameras'), false);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'incidents'), false);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'app/incidents/INC-2026-001'), false);
  });

  it('permits staff roles to cameras and incident queues', () => {
    assert.equal(canAccessRoute(ROLES.FACULTY, 'cameras'), true);
    assert.equal(canAccessRoute(ROLES.FACULTY, 'incidents'), true);
    assert.equal(canAccessRoute(ROLES.FACULTY, 'app/incidents/INC-2026-001'), true);

    assert.equal(canAccessRoute(ROLES.DEPT_HEAD, 'cameras'), true);
    assert.equal(canAccessRoute(ROLES.DEPT_HEAD, 'incidents'), true);

    assert.equal(canAccessRoute(ROLES.SUPER_ADMIN, 'cameras'), true);
    assert.equal(canAccessRoute(ROLES.SUPER_ADMIN, 'incidents'), true);
  });

  it('verifies staff vs student role boundaries', () => {
    assert.equal(isStaff(ROLES.SUPER_ADMIN), true);
    assert.equal(isStaff(ROLES.DEPT_HEAD), true);
    assert.equal(isStaff(ROLES.FACULTY), true);
    assert.equal(isStaff(ROLES.STUDENT), false);

    assert.equal(isStudent(ROLES.STUDENT), true);
    assert.equal(isStudent(ROLES.FACULTY), false);
  });
});
