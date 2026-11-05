/**
 * Campus User Roles & Definitions
 * Aligned with shared/constants.json and backend auth models
 */

export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  DEPT_HEAD: 'DEPT_HEAD',
  FACULTY: 'FACULTY',
  STUDENT: 'STUDENT',
};

export const ROLE_LABELS = {
  [ROLES.SUPER_ADMIN]: 'Super Administrator',
  [ROLES.DEPT_HEAD]: 'Department Head',
  [ROLES.FACULTY]: 'Faculty Member',
  [ROLES.STUDENT]: 'Student',
};

export const ROLE_COLORS = {
  [ROLES.SUPER_ADMIN]: '#DC2626', // Red
  [ROLES.DEPT_HEAD]: '#7C3AED',   // Purple
  [ROLES.FACULTY]: '#2563EB',     // Blue
  [ROLES.STUDENT]: '#059669',     // Emerald
};
