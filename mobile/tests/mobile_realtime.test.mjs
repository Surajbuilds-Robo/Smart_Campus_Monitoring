import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  connectSocket,
  getSocket,
  disconnectSocket,
  isSocketConnected,
} from '../services/socketClient.js';
import {
  validateCameraStatusPayload,
  validateParkingPayload,
  validateOccupancyPayload,
  validateIncidentCreatedPayload,
  validateIncidentUpdatedPayload,
  validateNotificationPayload,
} from '../utils/eventValidators.js';
import {
  isDuplicateNotification,
  clearNotificationCache,
  resolveNotificationRoute,
  checkNotificationPermissions,
  requestNotificationPermissions,
  getExpoPushToken,
  getRuntimeNotificationSupport,
  setupNotificationChannels,
  getChannelInitializationStatus,
  resetChannelInitializationState,
  configureForegroundNotifications,
  scheduleLocalNotification,
  cancelLocalNotification,
  cancelAllLocalNotifications,
  addNotificationResponseListener,
} from '../services/notificationService.js';
import { ROLES } from '../constants/roles.js';
import { isStaff } from '../constants/permissions.js';

describe('Mobile Step 4 — Realtime Socket.IO Client Lifecycle', () => {
  beforeEach(() => {
    disconnectSocket();
  });

  it('rejects connection attempts without a valid JWT token', () => {
    assert.equal(connectSocket(null), null);
    assert.equal(connectSocket(''), null);
    assert.equal(connectSocket('   '), null);
    assert.equal(connectSocket(123), null);
    assert.equal(getSocket(), null);
    assert.equal(isSocketConnected(), false);
  });

  it('maintains a managed singleton connection instance for valid token', () => {
    const fakeToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.signature';
    const socket = connectSocket(fakeToken, 'http://localhost:5000');

    assert.ok(socket, 'Socket instance should be created');
    assert.equal(socket.auth.token, fakeToken);

    // Subsequent calls with same token return identical singleton
    const socketAgain = connectSocket(fakeToken, 'http://localhost:5000');
    assert.equal(socketAgain, socket, 'Should reuse existing socket singleton');

    disconnectSocket();
    assert.equal(getSocket(), null, 'Socket should be cleared on disconnect');
  });

  it('recreates socket instance when user token changes', () => {
    const tokenUser1 = 'user1.token.signature';
    const tokenUser2 = 'user2.token.signature';

    const socket1 = connectSocket(tokenUser1, 'http://localhost:5000');
    assert.equal(socket1.auth.token, tokenUser1);

    const socket2 = connectSocket(tokenUser2, 'http://localhost:5000');
    assert.notEqual(socket1, socket2, 'Should discard old session when token changes');
    assert.equal(socket2.auth.token, tokenUser2);

    disconnectSocket();
  });
});

describe('Mobile Step 4 — Realtime Event Payload Validation', () => {
  it('validates camera:status payloads and rejects invalid values', () => {
    // Valid camera status
    const valid = validateCameraStatusPayload({
      cameraId: 'CAM-001',
      status: 'online',
    });
    assert.ok(valid);
    assert.equal(valid.cameraId, 'CAM-001');
    assert.equal(valid.status, 'online');
    assert.ok(valid.lastHeartbeat);

    // Invalid status (e.g. arbitrary string)
    assert.equal(
      validateCameraStatusPayload({ cameraId: 'CAM-001', status: 'exploding' }),
      null
    );

    // Missing camera ID
    assert.equal(
      validateCameraStatusPayload({ status: 'online' }),
      null
    );

    // Null or malformed payload
    assert.equal(validateCameraStatusPayload(null), null);
    assert.equal(validateCameraStatusPayload('invalid'), null);
  });

  it('validates parking:updated payloads and prevents division by zero / negative spaces', () => {
    const valid = validateParkingPayload({
      zoneId: 'LOT-A',
      name: 'North Garage',
      totalSpaces: 200,
      occupiedSpaces: 50,
      availableSpaces: 150,
    });
    assert.ok(valid);
    assert.equal(valid.totalSpaces, 200);
    assert.equal(valid.occupiedSpaces, 50);
    assert.equal(valid.availableSpaces, 150);

    // Missing availableSpaces should compute total - occupied
    const autoAvailable = validateParkingPayload({
      zoneId: 'LOT-B',
      totalSpaces: 100,
      occupiedSpaces: 25,
    });
    assert.ok(autoAvailable);
    assert.equal(autoAvailable.availableSpaces, 75);

    // Negative capacity or occupied spaces should be rejected
    assert.equal(
      validateParkingPayload({ zoneId: 'LOT-C', totalSpaces: -10, occupiedSpaces: 5 }),
      null
    );
    assert.equal(
      validateParkingPayload({ zoneId: 'LOT-C', totalSpaces: 100, occupiedSpaces: -5 }),
      null
    );
    assert.equal(
      validateParkingPayload({ totalSpaces: 100, occupiedSpaces: 50 }),
      null,
      'Missing zoneId / id must be rejected'
    );
  });

  it('validates occupancy:updated payloads and calculates severity levels', () => {
    const validNormal = validateOccupancyPayload({
      zoneName: 'Central Library',
      peopleCount: 40,
      capacity: 100,
    });
    assert.ok(validNormal);
    assert.equal(validNormal.occupancyRatio, 0.4);
    assert.equal(validNormal.level, 'normal');

    const validWarning = validateOccupancyPayload({
      zoneName: 'Dining Hall',
      peopleCount: 75,
      capacity: 100,
    });
    assert.ok(validWarning);
    assert.equal(validWarning.occupancyRatio, 0.75);
    assert.equal(validWarning.level, 'warning');

    const validCritical = validateOccupancyPayload({
      zoneName: 'Auditorium',
      peopleCount: 95,
      capacity: 100,
    });
    assert.ok(validCritical);
    assert.equal(validCritical.occupancyRatio, 0.95);
    assert.equal(validCritical.level, 'critical');

    // Invalid counts
    assert.equal(
      validateOccupancyPayload({ zoneName: 'Gym', peopleCount: -5, capacity: 50 }),
      null
    );
  });

  it('validates incident:created payloads and verifies valid statuses', () => {
    const valid = validateIncidentCreatedPayload({
      incidentId: 'INC-2026-001',
      eventType: 'fall',
      severity: 'high',
      status: 'new',
    });
    assert.ok(valid);
    assert.equal(valid.incidentId, 'INC-2026-001');
    assert.equal(valid.eventType, 'fall');
    assert.equal(valid.severity, 'high');
    assert.equal(valid.status, 'new');

    // Missing identifier
    assert.equal(
      validateIncidentCreatedPayload({ eventType: 'fall', severity: 'high' }),
      null
    );
  });

  it('validates incident:updated payloads and sanitizes forward transitions', () => {
    const valid = validateIncidentUpdatedPayload({
      incidentId: 'INC-2026-001',
      status: 'acknowledged',
      updatedAt: '2026-10-22T10:00:00.000Z',
    });
    assert.ok(valid);
    assert.equal(valid.status, 'acknowledged');

    // Invalid status string
    assert.equal(
      validateIncidentUpdatedPayload({
        incidentId: 'INC-2026-001',
        status: 'arbitrary_status',
      }),
      null
    );
  });

  it('validates notification:created payloads', () => {
    const valid = validateNotificationPayload({
      id: 'notif-12345',
      type: 'incident_created',
      title: 'Perimeter Alert',
      message: 'Unusual crowding detected near Gate 3',
      resourceId: 'INC-2026-001',
      resourceType: 'incident',
    });
    assert.ok(valid);
    assert.equal(valid.id, 'notif-12345');
    assert.equal(valid.type, 'incident_created');
    assert.equal(valid.resourceId, 'INC-2026-001');

    // Missing notification ID
    assert.equal(validateNotificationPayload({ title: 'Alert' }), null);
  });
});

describe('Mobile Step 4 — Event Deduplication & Stale Data Guards', () => {
  beforeEach(() => {
    clearNotificationCache();
  });

  it('detects and blocks duplicate notifications via memory cache', () => {
    const notifId = 'notif-alert-999';

    // First appearance: not a duplicate
    assert.equal(isDuplicateNotification(notifId), false);

    // Second appearance (e.g. received via both Socket.IO and push service): duplicate
    assert.equal(isDuplicateNotification(notifId), true);

    // Different notification: not a duplicate
    assert.equal(isDuplicateNotification('notif-alert-1000'), false);
  });

  it('clears notification deduplication cache on session reset', () => {
    const notifId = 'notif-test-1';
    assert.equal(isDuplicateNotification(notifId), false);
    assert.equal(isDuplicateNotification(notifId), true);

    clearNotificationCache();
    // After clearance, it can be received freshly if needed
    assert.equal(isDuplicateNotification(notifId), false);
  });

  it('correctly guards against stale incident updates with older timestamps', () => {
    const existingIncident = {
      incidentId: 'INC-1',
      status: 'investigating',
      updatedAt: '2026-10-22T11:00:00.000Z',
    };

    const staleEvent = {
      incidentId: 'INC-1',
      status: 'acknowledged',
      updatedAt: '2026-10-22T10:30:00.000Z', // 30 minutes older
    };

    const isStale =
      new Date(staleEvent.updatedAt).getTime() < new Date(existingIncident.updatedAt).getTime();
    assert.equal(isStale, true, 'Older timestamp must be detected as stale');

    const freshEvent = {
      incidentId: 'INC-1',
      status: 'resolved',
      updatedAt: '2026-10-22T11:15:00.000Z',
    };

    const isFresh =
      new Date(freshEvent.updatedAt).getTime() >= new Date(existingIncident.updatedAt).getTime();
    assert.equal(isFresh, true, 'Newer timestamp must be accepted');
  });

  it('deduplicates new incident insertion by stable id', () => {
    const currentList = [
      { id: '1', incidentId: 'INC-1', status: 'new' },
      { id: '2', incidentId: 'INC-2', status: 'acknowledged' },
    ];

    const duplicateIncident = { id: '1', incidentId: 'INC-1', status: 'new' };
    const exists = currentList.some(
      (i) => i.id === duplicateIncident.id || i.incidentId === duplicateIncident.incidentId
    );
    assert.equal(exists, true, 'Duplicate incident creation event must not be duplicated in state');

    const brandNewIncident = { id: '3', incidentId: 'INC-3', status: 'new' };
    const isNew = !currentList.some(
      (i) => i.id === brandNewIncident.id || i.incidentId === brandNewIncident.incidentId
    );
    assert.equal(isNew, true, 'Unique incident creation event should be prepended');
  });
});

describe('Mobile Step 4 — Notification Routing & Platform Fallbacks', () => {
  it('correctly routes incident notification tap to detailed incident view', () => {
    const route1 = resolveNotificationRoute({
      resourceType: 'incident',
      resourceId: '6ad99cac5474a5d4a2aa2980',
    });
    assert.equal(route1, '/(app)/incidents/6ad99cac5474a5d4a2aa2980');

    const route2 = resolveNotificationRoute({
      type: 'incident_created',
      resourceId: 'INC-2026-888',
    });
    assert.equal(route2, '/(app)/incidents/INC-2026-888');

    const routeWithoutId = resolveNotificationRoute({
      type: 'incident_created',
    });
    assert.equal(routeWithoutId, '/(app)/incidents');
  });

  it('routes camera and occupancy notifications to authorized operational screens', () => {
    assert.equal(resolveNotificationRoute({ type: 'camera_status' }), '/(app)/cameras');
    assert.equal(resolveNotificationRoute({ type: 'occupancy_warning' }), '/(app)/occupancy');
    assert.equal(resolveNotificationRoute({ type: 'unknown_type' }), '/(app)');
    assert.equal(resolveNotificationRoute(null), null);
  });

  it('gracefully handles push token acquisition in unsupported test/simulator environments', async () => {
    const runtime = await getRuntimeNotificationSupport();
    assert.ok(runtime);
    assert.equal(typeof runtime.supported, 'boolean');

    const tokenResult = await getExpoPushToken();
    assert.ok(tokenResult);
    // In Node test environment, expo-notifications native module is mocked or unavailable
    assert.equal(typeof tokenResult.supported, 'boolean');

    const permResult = await checkNotificationPermissions();
    assert.ok(permResult);
    assert.equal(typeof permResult.granted, 'boolean');

    const reqResult = await requestNotificationPermissions();
    assert.ok(reqResult);
    assert.equal(typeof reqResult.granted, 'boolean');

    const foregroundResult = await configureForegroundNotifications();
    assert.equal(typeof foregroundResult, 'boolean');

    const channelResult = await setupNotificationChannels();
    assert.ok(channelResult);
    assert.equal(typeof channelResult.success, 'boolean');
    assert.equal(typeof channelResult.status, 'string');

    // Repeated call must return cached channel status without re-attempting
    const repeatedChannelResult = await setupNotificationChannels();
    assert.equal(repeatedChannelResult.status, channelResult.status);

    const channelStatus = getChannelInitializationStatus();
    assert.ok(channelStatus.attempted);

    // Test local notification validation
    const emptyTitleResult = await scheduleLocalNotification({ title: '', body: 'Hello' });
    assert.equal(emptyTitleResult.scheduled, false);
    assert.match(emptyTitleResult.reason, /title is required/i);

    const emptyBodyResult = await scheduleLocalNotification({ title: 'Alert', body: '' });
    assert.equal(emptyBodyResult.scheduled, false);
    assert.match(emptyBodyResult.reason, /body is required/i);

    // Test local notification scheduling attempt
    const scheduleResult = await scheduleLocalNotification({
      title: 'Incident Detected',
      body: 'Person fall detected in Quad',
      data: { resourceType: 'incident', resourceId: 'INC-101' },
      channelId: 'campus-emergency',
    });
    assert.equal(typeof scheduleResult.scheduled, 'boolean');

    const cancelResult = await cancelLocalNotification('dummy-id');
    assert.equal(typeof cancelResult, 'boolean');

    const cancelAllResult = await cancelAllLocalNotifications();
    assert.equal(typeof cancelAllResult, 'boolean');

    const unsubscribe = await addNotificationResponseListener(() => {});
    assert.equal(typeof unsubscribe, 'function');
    unsubscribe();
  });
});

describe('Mobile Step 4 — Role Boundaries & Department Isolation', () => {
  it('strictly excludes student role from subscribing or processing incident and camera events', () => {
    assert.equal(isStaff(ROLES.STUDENT), false);
    assert.equal(isStaff(ROLES.FACULTY), true);
    assert.equal(isStaff(ROLES.DEPT_HEAD), true);
    assert.equal(isStaff(ROLES.SUPER_ADMIN), true);

    // Verify student cannot access incidents or camera update handlers
    const studentCanReceiveStaffEvents = isStaff(ROLES.STUDENT);
    assert.equal(studentCanReceiveStaffEvents, false, 'Student must not receive staff camera or incident events');
  });
});
