/**
 * Design System Tokens & System Appearance Theme
 * Supporting device light/dark appearance and touch-friendly layouts
 */

import { useColorScheme } from 'react-native';

export const palette = {
  // Brand Blues
  primary: '#2563EB',
  primaryHover: '#1D4ED8',
  primaryLight: '#3B82F6',
  primarySubtle: '#EFF6FF',
  primarySubtleDark: '#1E293B',

  // Status & Accents
  success: '#10B981',
  successSubtle: '#ECFDF5',
  warning: '#F59E0B',
  warningSubtle: '#FFFBEB',
  error: '#EF4444',
  errorSubtle: '#FEF2F2',
  info: '#06B6D4',
  infoSubtle: '#ECFEFF',

  // Neutrals - Light
  light: {
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceSecondary: '#F1F5F9',
    border: '#E2E8F0',
    borderStrong: '#CBD5E1',
    textPrimary: '#0F172A',
    textSecondary: '#475569',
    textMuted: '#94A3B8',
    cardBackground: '#FFFFFF',
    cardBorder: '#E2E8F0',
    statusBarStyle: 'dark',
  },

  // Neutrals - Dark
  dark: {
    background: '#0B0F17',
    surface: '#131B2B',
    surfaceSecondary: '#1C263A',
    border: '#1E293B',
    borderStrong: '#334155',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    cardBackground: '#131B2B',
    cardBorder: '#1E293B',
    statusBarStyle: 'light',
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const typography = {
  title: 24,
  subtitle: 18,
  heading: 16,
  body: 14,
  caption: 12,
  tiny: 10,
};

/**
 * Hook to retrieve colors matching the current system appearance
 */
export function useThemeColors() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const currentMode = isDark ? palette.dark : palette.light;

  return {
    isDark,
    ...currentMode,
    primary: palette.primary,
    primaryLight: palette.primaryLight,
    success: palette.success,
    warning: palette.warning,
    error: palette.error,
    info: palette.info,
  };
}
