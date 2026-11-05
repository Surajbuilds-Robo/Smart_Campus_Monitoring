import constants from "../../../shared/constants.json" with { type: "json" };
import {
  LayoutDashboard,
  Video,
  CarFront,
  Users,
  MapPin,
  AlertTriangle,
  Bell,
  ShieldCheck,
} from "lucide-react";

const { roles } = constants;

export const CAMPUS_ROLES = roles;

export const STAFF_ROLES = [
  roles.SUPER_ADMIN,
  roles.SECURITY,
  roles.DEPT_HEAD,
  roles.FACULTY,
];
export const ADMIN_ROLES = [roles.SUPER_ADMIN, roles.DEPT_HEAD];
export const CAMERA_MANAGER_ROLES = [roles.SUPER_ADMIN, roles.SECURITY];

/**
 * Standard campus navigation items mapped to authorized roles.
 * Preserves the 9-item foundation and strict role boundaries.
 */
export const navigationItems = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
    roles: [
      roles.SUPER_ADMIN,
      roles.SECURITY,
      roles.DEPT_HEAD,
      roles.FACULTY,
      roles.STUDENT,
    ],
    description: "System overview, sensory diagnostics, and operational KPIs",
  },
  {
    label: "Cameras",
    path: "/cameras",
    icon: Video,
    roles: [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY],
    description: "Camera feeds, streaming telemetry, and edge node health",
  },
  {
    label: "Parking",
    path: "/parking",
    icon: CarFront,
    roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
    description: "Parking lot capacity, bay status, and campus vehicle occupancy",
  },
  {
    label: "Crowd Monitoring",
    path: "/crowd",
    icon: Users,
    roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
    description: "Real-time headcounts, zone density, and congestion thresholds",
  },
  {
    label: "Campus Resources",
    path: "/resources",
    icon: MapPin,
    roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
    description: "Emergency blue lights, medical posts, and security desks",
  },
  {
    label: "Incidents",
    path: "/incidents",
    icon: AlertTriangle,
    roles: [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY],
    description: "AI-detected safety incidents, resolution workflows, and evidence review",
  },
  {
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    roles: [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
    description: "System announcements, perimeter alerts, and security updates",
  },
  {
    label: "User Management",
    path: "/users",
    icon: ShieldCheck,
    roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD],
    description: "Account provisioning, role assignments, and department scopes",
  },
];

/**
 * Filter visible navigation items based on user role.
 * Returns empty array for invalid or unauthenticated roles.
 */
export function getVisibleNavigation(role) {
  if (!role || typeof role !== "string") return [];
  return navigationItems.filter((item) => item.roles.includes(role));
}

/**
 * Check if a role can access a specific route path.
 */
export function canAccessPath(role, path) {
  if (!role || !path) return false;
  const target = navigationItems.find(
    (item) => item.path === path || path.startsWith(`${item.path}/`)
  );
  if (!target) return false;
  return target.roles.includes(role);
}

/**
 * Camera management authorization:
 * Strictly limited to SUPER_ADMIN and SECURITY personnel.
 */
export function canManageCameras(role) {
  return CAMERA_MANAGER_ROLES.includes(role);
}

/**
 * Privacy & Evidence authorization:
 * Only authorized staff roles (SUPER_ADMIN, SECURITY, DEPT_HEAD, FACULTY) can view
 * incident evidence snapshots and camera hardware identifiers.
 */
export function canViewEvidence(role) {
  return STAFF_ROLES.includes(role);
}

/**
 * User administration authorization:
 * Strictly limited to SUPER_ADMIN and DEPT_HEAD.
 */
export function canManageUsers(role) {
  return ADMIN_ROLES.includes(role);
}

/**
 * Incident workflow authorization:
 * Staff roles can update status (acknowledge, investigate, resolve, dismiss).
 */
export function canManageIncidents(role) {
  return STAFF_ROLES.includes(role);
}

export default {
  roles,
  CAMPUS_ROLES,
  STAFF_ROLES,
  ADMIN_ROLES,
  CAMERA_MANAGER_ROLES,
  navigationItems,
  getVisibleNavigation,
  canAccessPath,
  canManageCameras,
  canViewEvidence,
  canManageUsers,
  canManageIncidents,
};
