/**
 * Role-Based Access Control (RBAC) & Navigation Permissions
 * Aligned with backend authorization middleware and shared/constants.json
 */

import { ROLES } from './roles.js';

export const STAFF_ROLES = [ROLES.SUPER_ADMIN, ROLES.DEPT_HEAD, ROLES.FACULTY];
export const ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.DEPT_HEAD];

/**
 * Checks whether a role belongs to staff (SUPER_ADMIN, DEPT_HEAD, FACULTY)
 * @param {string} role
 * @returns {boolean}
 */
export function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

/**
 * Checks whether a role belongs to administration (SUPER_ADMIN, DEPT_HEAD)
 * @param {string} role
 * @returns {boolean}
 */
export function isAdmin(role) {
  return ADMIN_ROLES.includes(role);
}

/**
 * Checks whether a role is strictly SUPER_ADMIN
 * @param {string} role
 * @returns {boolean}
 */
export function isSuperAdmin(role) {
  return role === ROLES.SUPER_ADMIN;
}

/**
 * Checks whether a role is strictly STUDENT
 * @param {string} role
 * @returns {boolean}
 */
export function isStudent(role) {
  return role === ROLES.STUDENT;
}

/**
 * Feature permissions mapping by route or capability
 */
export const ROUTE_PERMISSIONS = {
  // Publicly accessible to all authenticated campus roles
  'app/index': [ROLES.SUPER_ADMIN, ROLES.DEPT_HEAD, ROLES.FACULTY, ROLES.STUDENT],
  'app/parking': [ROLES.SUPER_ADMIN, ROLES.DEPT_HEAD, ROLES.FACULTY, ROLES.STUDENT],
  'app/occupancy': [ROLES.SUPER_ADMIN, ROLES.DEPT_HEAD, ROLES.FACULTY, ROLES.STUDENT],

  // Staff and Management only (Surveillance cameras & incident feeds)
  'app/cameras': STAFF_ROLES,
  'app/incidents': STAFF_ROLES,

  // Admin only (User management, department configs)
  'app/users': ADMIN_ROLES,
};

/**
 * Validates whether a specific role is allowed to view or navigate to a target route
 * @param {string} role
 * @param {string} routeKey
 * @returns {boolean}
 */
export function canAccessRoute(role, routeKey) {
  if (!role || !Object.values(ROLES).includes(role)) {
    return false;
  }

  if (!routeKey) {
    return false;
  }

  const normalizedKey = routeKey
    .replace(/^\/+/, '')
    .replace(/^\(app\)\//, 'app/')
    .replace(/^\(auth\)\//, 'auth/');

  const allowedRoles =
    ROUTE_PERMISSIONS[normalizedKey] ||
    ROUTE_PERMISSIONS[`app/${normalizedKey}`] ||
    (normalizedKey.startsWith('app/incidents/') ? STAFF_ROLES : undefined);

  if (!allowedRoles) {
    // If route has no restriction defined, allow authenticated users
    return true;
  }

  return allowedRoles.includes(role);
}

/**
 * Returns available navigation items filtered for the current authenticated role
 * @param {string} role
 * @returns {Array<{key: string, label: string, icon: string, description: string}>}
 */
export function getAuthorizedNavigationItems(role) {
  if (!role || !Object.values(ROLES).includes(role)) {
    return [];
  }

  const items = [];

  // All roles have access to Overview/Dashboard
  items.push({
    key: 'app/index',
    label: 'Campus Overview',
    icon: 'LayoutDashboard',
    description: 'Active campus metrics and role status',
  });

  // Students, Faculty, Admins see Parking
  items.push({
    key: 'app/parking',
    label: 'Parking Availability',
    icon: 'Car',
    description: 'Real-time lot occupancy and vacant spaces',
  });

  // Students, Faculty, Admins see Occupancy
  items.push({
    key: 'app/occupancy',
    label: 'Campus Crowd Density',
    icon: 'Users',
    description: 'Library, cafeteria, and building crowd levels',
  });

  // Staff only: Incident Management
  if (isStaff(role)) {
    items.push({
      key: 'app/incidents',
      label: 'Incident Management',
      icon: 'AlertTriangle',
      description: 'AI-detected safety events, falls, and crowd warnings',
    });

    items.push({
      key: 'app/cameras',
      label: 'CCTV Camera Feeds',
      icon: 'Camera',
      description: 'Stream health and edge AI detection feeds',
    });
  }

  // Admins only: User Management
  if (isAdmin(role)) {
    items.push({
      key: 'app/users',
      label: 'User Administration',
      icon: 'ShieldCheck',
      description: 'Department accounts and access scopes',
    });
  }

  return items;
}

export default {
  isStaff,
  isAdmin,
  isSuperAdmin,
  isStudent,
  canAccessRoute,
  getAuthorizedNavigationItems,
};
