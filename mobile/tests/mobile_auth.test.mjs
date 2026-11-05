import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

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
  saveToken,
  getToken,
  deleteToken,
} from '../services/tokenStorage.js';
import {
  getApiErrorMessage,
  setUnauthorizedHandler,
} from '../services/apiClient.js';
import { login, logout } from '../services/authService.js';

describe('Mobile Step 2 — Role Boundaries & RBAC Permissions', () => {
  it('preserves established canonical roles contract', () => {
    assert.equal(ROLES.SUPER_ADMIN, 'SUPER_ADMIN');
    assert.equal(ROLES.DEPT_HEAD, 'DEPT_HEAD');
    assert.equal(ROLES.FACULTY, 'FACULTY');
    assert.equal(ROLES.STUDENT, 'STUDENT');
    assert.equal(Object.keys(ROLES).length, 4);

    assert.equal(ROLE_LABELS[ROLES.SUPER_ADMIN], 'Super Administrator');
    assert.equal(ROLE_LABELS[ROLES.DEPT_HEAD], 'Department Head');
    assert.equal(ROLE_LABELS[ROLES.FACULTY], 'Faculty Member');
    assert.equal(ROLE_LABELS[ROLES.STUDENT], 'Student');
  });

  it('accurately verifies isStaff role boundaries', () => {
    assert.equal(isStaff(ROLES.SUPER_ADMIN), true);
    assert.equal(isStaff(ROLES.DEPT_HEAD), true);
    assert.equal(isStaff(ROLES.FACULTY), true);
    assert.equal(isStaff(ROLES.STUDENT), false);
    assert.equal(isStaff('UNKNOWN_ROLE'), false);
    assert.equal(isStaff(null), false);
    assert.equal(isStaff(undefined), false);
  });

  it('accurately verifies isAdmin role boundaries', () => {
    assert.equal(isAdmin(ROLES.SUPER_ADMIN), true);
    assert.equal(isAdmin(ROLES.DEPT_HEAD), true);
    assert.equal(isAdmin(ROLES.FACULTY), false);
    assert.equal(isAdmin(ROLES.STUDENT), false);
    assert.equal(isAdmin('GUEST'), false);
  });

  it('accurately verifies isStudent and isSuperAdmin roles', () => {
    assert.equal(isStudent(ROLES.STUDENT), true);
    assert.equal(isStudent(ROLES.FACULTY), false);
    assert.equal(isStudent(ROLES.SUPER_ADMIN), false);

    assert.equal(isSuperAdmin(ROLES.SUPER_ADMIN), true);
    assert.equal(isSuperAdmin(ROLES.DEPT_HEAD), false);
  });

  it('enforces route gating and bars student from surveillance and incident queues', () => {
    // Public routes open to students
    assert.equal(canAccessRoute(ROLES.STUDENT, 'app/parking'), true);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'app/occupancy'), true);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'app/index'), true);

    // Surveillance and incident routes strictly barred from students
    assert.equal(canAccessRoute(ROLES.STUDENT, 'app/cameras'), false);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'app/incidents'), false);
    assert.equal(canAccessRoute(ROLES.STUDENT, 'app/users'), false);

    // Faculty allowed cameras and incidents, but barred from user management
    assert.equal(canAccessRoute(ROLES.FACULTY, 'app/cameras'), true);
    assert.equal(canAccessRoute(ROLES.FACULTY, 'app/incidents'), true);
    assert.equal(canAccessRoute(ROLES.FACULTY, 'app/users'), false);

    // Super Admin allowed all routes
    assert.equal(canAccessRoute(ROLES.SUPER_ADMIN, 'app/cameras'), true);
    assert.equal(canAccessRoute(ROLES.SUPER_ADMIN, 'app/incidents'), true);
    assert.equal(canAccessRoute(ROLES.SUPER_ADMIN, 'app/users'), true);
  });

  it('handles unknown or malformed roles safely', () => {
    assert.equal(canAccessRoute('HACKER_ROLE', 'app/cameras'), false);
    assert.equal(canAccessRoute('', 'app/parking'), false);
    assert.equal(canAccessRoute(null, 'app/index'), false);
    assert.equal(getAuthorizedNavigationItems('UNSUPPORTED_ROLE').length, 0);
  });

  it('returns role-filtered navigation items', () => {
    const studentItems = getAuthorizedNavigationItems(ROLES.STUDENT);
    assert.equal(studentItems.length, 3);
    const studentKeys = studentItems.map((i) => i.key);
    assert.deepEqual(studentKeys, ['app/index', 'app/parking', 'app/occupancy']);

    const facultyItems = getAuthorizedNavigationItems(ROLES.FACULTY);
    assert.equal(facultyItems.length, 5);
    const facultyKeys = facultyItems.map((i) => i.key);
    assert.ok(facultyKeys.includes('app/cameras'));
    assert.ok(facultyKeys.includes('app/incidents'));
    assert.ok(!facultyKeys.includes('app/users'));

    const adminItems = getAuthorizedNavigationItems(ROLES.SUPER_ADMIN);
    assert.equal(adminItems.length, 6);
    const adminKeys = adminItems.map((i) => i.key);
    assert.ok(adminKeys.includes('app/users'));
  });
});

describe('Mobile Step 2 — Secure Token Storage & Lifecycle', () => {
  beforeEach(async () => {
    await deleteToken();
  });

  it('saves and retrieves token cleanly without logging', async () => {
    const mockToken = 'mock_jwt_header.mock_jwt_payload.mock_signature';
    const saved = await saveToken(mockToken);
    assert.ok(saved);

    const retrieved = await getToken();
    assert.equal(retrieved, mockToken);
  });

  it('deletes token upon session clearance', async () => {
    await saveToken('token_to_be_deleted');
    assert.ok((await getToken()) !== null);

    const deleted = await deleteToken();
    assert.ok(deleted);

    const afterDelete = await getToken();
    assert.equal(afterDelete, null);
  });

  it('rejects invalid or non-string token inputs gracefully', async () => {
    const resNull = await saveToken(null);
    assert.equal(resNull, false);

    const resEmpty = await saveToken('');
    assert.equal(resEmpty, false);

    const resObj = await saveToken({ token: 'abc' });
    assert.equal(resObj, false);
  });
});

describe('Mobile Step 2 — API Client & Error Extraction', () => {
  it('extracts direct response error message', () => {
    const err = { message: 'Invalid email or password.' };
    assert.equal(getApiErrorMessage(err), 'Invalid email or password.');
  });

  it('extracts validation errors array from backend', () => {
    const err = {
      errors: [
        { field: 'email', message: 'Valid university email is required.' },
      ],
    };
    assert.equal(getApiErrorMessage(err), 'Valid university email is required.');
  });

  it('returns fallback message for empty error', () => {
    assert.equal(getApiErrorMessage(null), 'An unexpected error occurred.');
    assert.equal(getApiErrorMessage({}, 'Custom fallback'), 'Custom fallback');
  });

  it('accepts string errors directly', () => {
    assert.equal(getApiErrorMessage('Server unreachable'), 'Server unreachable');
  });

  it('registers and unregisters unauthorized handler safely', () => {
    let triggered = false;
    const testHandler = () => {
      triggered = true;
    };

    setUnauthorizedHandler(testHandler);
    setUnauthorizedHandler(null);
    assert.equal(triggered, false);
  });
});

describe('Mobile Step 2 — Auth Service Input Validation', () => {
  it('prevents submission with empty email', async () => {
    await assert.rejects(
      async () => {
        await login('', 'SomePassword123');
      },
      {
        message: 'Please enter your campus email address.',
      }
    );
  });

  it('prevents submission with empty password', async () => {
    await assert.rejects(
      async () => {
        await login('user@campus.edu', '');
      },
      {
        message: 'Please enter your account password.',
      }
    );
  });

  it('logout discards stored token even if server is offline', async () => {
    await saveToken('temporary_auth_token');
    assert.ok((await getToken()) !== null);

    // Call logout (catches network failure gracefully)
    await logout();

    const currentToken = await getToken();
    assert.equal(currentToken, null);
  });
});
