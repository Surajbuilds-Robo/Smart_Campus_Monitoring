import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../constants/config.js';
import { ROLES, ROLE_LABELS, ROLE_COLORS } from '../constants/roles.js';
import {
  isStaff,
  isAdmin,
  isSuperAdmin,
  isStudent,
  canAccessRoute,
  getAuthorizedNavigationItems,
} from '../constants/permissions.js';
import {
  computePercentage,
  getCrowdStatus,
  formatIncidentEventType,
  getSeverityColor,
  getStatusColor,
  getPermittedTransitions,
  canTransitionIncident,
} from '../utils/calculations.js';
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
} from '../services/notificationService.js';
import { getApiErrorMessage } from '../services/apiClient.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mobileRoot = path.resolve(__dirname, '..');

describe('Mobile Step 5 — App Configuration & Release Metadata Audit', () => {
  it('verifies app.json contains valid Android package and iOS bundleIdentifier', () => {
    const appJsonPath = path.join(mobileRoot, 'app.json');
    assert.ok(fs.existsSync(appJsonPath), 'app.json must exist');

    const raw = fs.readFileSync(appJsonPath, 'utf-8');
    const appJson = JSON.parse(raw);
    const expo = appJson.expo;

    assert.ok(expo, 'expo configuration root must be present');
    assert.equal(expo.name, 'Smart Campus Monitoring');
    assert.equal(expo.slug, 'smart-campus-monitoring');
    assert.equal(expo.scheme, 'smartcampus');
    assert.ok(expo.version, 'version must be specified');

    // Release Identifiers
    assert.ok(expo.android?.package, 'android.package must be defined for release');
    assert.match(
      expo.android.package,
      /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/,
      'android.package must be a valid reverse-DNS identifier'
    );

    assert.ok(expo.ios?.bundleIdentifier, 'ios.bundleIdentifier must be defined for release');
    assert.match(
      expo.ios.bundleIdentifier,
      /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/,
      'ios.bundleIdentifier must be a valid reverse-DNS identifier'
    );

    // Assets & Splash (supports expo.splash and SDK 58 expo-splash-screen plugin)
    const splashPlugin = Array.isArray(expo.plugins)
      ? expo.plugins.find((p) => (Array.isArray(p) && p[0] === 'expo-splash-screen') || p === 'expo-splash-screen')
      : null;
    const splashConfig = expo.splash || (Array.isArray(splashPlugin) ? splashPlugin[1] : null);
    assert.ok(expo.icon, 'app icon must be configured');
    assert.ok(splashConfig?.image, 'splash image must be configured');
    assert.equal(splashConfig.backgroundColor, '#0F172A');

    // Required plugins
    const pluginNames = expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    assert.ok(pluginNames.includes('expo-router'), 'expo-router plugin required');
    assert.ok(pluginNames.includes('expo-secure-store'), 'expo-secure-store plugin required');
    assert.ok(pluginNames.includes('expo-notifications'), 'expo-notifications plugin required');
  });

  it('verifies eas.json contains valid development, preview, and production profiles', () => {
    const easJsonPath = path.join(mobileRoot, 'eas.json');
    assert.ok(fs.existsSync(easJsonPath), 'eas.json must exist');

    const raw = fs.readFileSync(easJsonPath, 'utf-8');
    const easJson = JSON.parse(raw);

    assert.ok(easJson.build?.development, 'development build profile must exist');
    assert.equal(easJson.build.development.developmentClient, true);

    assert.ok(easJson.build?.preview, 'preview build profile must exist');
    assert.equal(easJson.build.preview.android?.buildType, 'apk');

    assert.ok(easJson.build?.production, 'production build profile must exist');
  });

  it('verifies .gitignore protects environment secrets and build outputs', () => {
    const gitignorePath = path.join(mobileRoot, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore must exist');

    const content = fs.readFileSync(gitignorePath, 'utf-8');
    assert.match(content, /node_modules/, 'node_modules must be ignored');
    assert.match(content, /\.env/, '.env must be ignored');
    assert.match(content, /dist\//, 'dist/ must be ignored');
    assert.match(content, /\.expo\//, '.expo/ must be ignored');
  });
});

describe('Mobile Step 5 — Security & Credential Isolation Audit', () => {
  it('confirms no privileged backend secrets or private keys are bundled in client config', () => {
    assert.ok(config.apiUrl, 'apiUrl must be defined');
    assert.ok(config.socketUrl, 'socketUrl must be defined');

    // Verify config contains no server secret keys
    const configKeys = Object.keys(config);
    const forbiddenSubstrings = ['secret', 'private', 'password', 'mongo', 'token', 'firebase'];

    for (const key of configKeys) {
      for (const forbidden of forbiddenSubstrings) {
        assert.ok(
          !key.toLowerCase().includes(forbidden),
          `Config key "${key}" contains sensitive substring "${forbidden}"`
        );
      }
    }
  });

  it('sanitizes API and Socket base URLs without trailing slash discrepancies', () => {
    assert.ok(!config.apiUrl.endsWith('//'), 'apiUrl must not contain double slashes');
    assert.ok(!config.socketUrl.endsWith('/'), 'socketUrl must not end with trailing slash');
  });

  it('confirms getApiErrorMessage sanitizes error structures without exposing server internals', () => {
    assert.equal(
      getApiErrorMessage(null, 'Safe default message'),
      'Safe default message'
    );
    assert.equal(
      getApiErrorMessage('Server unreachable', 'Safe default message'),
      'Server unreachable'
    );
    assert.equal(
      getApiErrorMessage({ message: 'Resource not found' }),
      'Resource not found'
    );
    assert.equal(
      getApiErrorMessage({ errors: [{ message: 'Email must be valid' }] }),
      'Email must be valid'
    );
  });
});

describe('Mobile Step 5 — End-to-End Role Gating & Navigation Boundaries', () => {
  it('confines STUDENT role strictly away from surveillance and operational incident queues', () => {
    assert.equal(canAccessRoute(ROLES.STUDENT, 'cameras'), false);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'incidents'), false);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'parking'), true);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'occupancy'), true);

    const navItems = getAuthorizedNavigationItems(ROLES.STUDENT);
    const navKeys = navItems.map((item) => item.key);
    assert.ok(navKeys.includes('app/parking'));
    assert.ok(navKeys.includes('app/occupancy'));
    assert.ok(!navKeys.includes('app/cameras'), 'Student must never see cameras nav item');
    assert.ok(!navKeys.includes('app/incidents'), 'Student must never see incidents nav item');
    assert.equal(navItems.length, 3);
  });

  it('permits staff roles access to surveillance and incident queues with admin user management for leaders', () => {
    for (const role of [ROLES.FACULTY, ROLES.DEPT_HEAD, ROLES.SUPER_ADMIN]) {
      assert.equal(canAccessRoute(role, 'cameras'), true);
      assert.equal(canAccessRoute(role, 'incidents'), true);
      assert.equal(canAccessRoute(role, 'parking'), true);
      assert.equal(canAccessRoute(role, 'occupancy'), true);

      const items = getAuthorizedNavigationItems(role);
      const expectedCount = role === ROLES.FACULTY ? 5 : 6;
      assert.equal(
        items.length,
        expectedCount,
        `${role} should have ${expectedCount} authorized navigation cards`
      );
    }
  });
});

describe('Mobile Step 5 — Incident State Machine & Terminal State Integrity', () => {
  it('enforces unidirectional lifecycle and blocks transitions from resolved or dismissed', () => {
    assert.equal(canTransitionIncident('new', 'acknowledged'), true);
    assert.equal(canTransitionIncident('new', 'dismissed'), true);
    assert.equal(canTransitionIncident('new', 'resolved'), false);

    assert.equal(canTransitionIncident('acknowledged', 'investigating'), true);
    assert.equal(canTransitionIncident('acknowledged', 'resolved'), true);
    assert.equal(canTransitionIncident('acknowledged', 'dismissed'), true);

    assert.equal(canTransitionIncident('investigating', 'resolved'), true);
    assert.equal(canTransitionIncident('investigating', 'dismissed'), true);
    assert.equal(canTransitionIncident('investigating', 'new'), false);

    // Terminal states cannot transition to anything
    assert.deepEqual(getPermittedTransitions('resolved'), []);
    assert.deepEqual(getPermittedTransitions('dismissed'), []);
    assert.equal(canTransitionIncident('resolved', 'new'), false);
    assert.equal(canTransitionIncident('resolved', 'acknowledged'), false);
    assert.equal(canTransitionIncident('dismissed', 'new'), false);
  });
});

describe('Mobile Step 5 — Realtime Telemetry, Validation & Edge Conditions', () => {
  it('handles edge condition crowd calculations safely', () => {
    // 0 capacity
    assert.equal(computePercentage(0, 0), 0);
    assert.equal(computePercentage(10, 0), 0);
    // Negative counts
    assert.equal(computePercentage(-5, 100), 0);
    // Over capacity is clamped to 100% to protect UI progress bars
    assert.equal(computePercentage(120, 100), 100);

    assert.equal(getCrowdStatus(0).level, 'normal');
    assert.equal(getCrowdStatus(69).level, 'normal');
    assert.equal(getCrowdStatus(70).level, 'warning');
    assert.equal(getCrowdStatus(89).level, 'warning');
    assert.equal(getCrowdStatus(90).level, 'critical');
    assert.equal(getCrowdStatus(120).level, 'critical');
  });

  it('rejects malformed payloads across all 6 canonical socket events', () => {
    assert.equal(validateCameraStatusPayload(null), null);
    assert.equal(validateCameraStatusPayload({ status: 'invalid' }), null);

    assert.equal(validateParkingPayload(null), null);
    assert.equal(validateParkingPayload({ totalSpaces: -1 }), null);

    assert.equal(validateOccupancyPayload(null), null);
    assert.equal(validateOccupancyPayload({ peopleCount: 'not-a-number' }), null);

    assert.equal(validateIncidentCreatedPayload(null), null);
    assert.equal(validateIncidentCreatedPayload({}), null);

    assert.equal(validateIncidentUpdatedPayload(null), null);
    assert.equal(validateIncidentUpdatedPayload({ status: 'illegal_status' }), null);

    assert.equal(validateNotificationPayload(null), null);
    assert.equal(validateNotificationPayload({}), null);
  });

  it('verifies notification deduplication cache clears properly', () => {
    clearNotificationCache();

    assert.equal(isDuplicateNotification('test-notif-1'), false);
    assert.equal(isDuplicateNotification('test-notif-1'), true);

    clearNotificationCache();
    assert.equal(isDuplicateNotification('test-notif-1'), false);
  });
});
