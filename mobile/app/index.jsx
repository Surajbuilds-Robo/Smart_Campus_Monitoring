import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ShieldCheck,
  Server,
  Smartphone,
  Layers,
  CheckCircle2,
  Info,
  Radio,
  Users,
  KeyRound,
  ArrowRight,

} from 'lucide-react-native';

import { useThemeColors, spacing, radius, typography } from '../constants/theme';
import { config } from '../constants/config';
import { ROLES, ROLE_LABELS, ROLE_COLORS } from '../constants/roles';
import { useAuth } from '../hooks/useAuth';

export default function InitialFoundationScreen() {
  const router = useRouter();
  const theme = useThemeColors();
  const { isAuthenticated, user } = useAuth();

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header / Brand Banner */}
        <View style={styles.header}>
          <View style={[styles.brandIconWrapper, { backgroundColor: theme.primary }]}>
            <ShieldCheck color="#FFFFFF" size={32} />
          </View>
          <Text style={[styles.appTitle, { color: theme.textPrimary }]}>
            Smart Campus
          </Text>
          <Text style={[styles.appSubtitle, { color: theme.primary }]}>
            Monitoring Mobile Edition
          </Text>
          <View style={[styles.badge, { backgroundColor: theme.surfaceSecondary }]}>
            <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
              Mobile Edition • Foundation, Auth, Realtime & Push Ready
            </Text>
          </View>
        </View>

        {/* Authentication Gateway Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: isAuthenticated ? theme.primary : theme.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <KeyRound color={theme.primary} size={20} />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
              {isAuthenticated ? 'Authenticated Session Active' : 'Authentication Gateway'}
            </Text>
          </View>

          <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
            {isAuthenticated
              ? `Signed in as ${user?.name} (${ROLE_LABELS[user?.role] || user?.role}). Stored securely with expo-secure-store.`
              : 'Secure login integrated with backend JWT auth service, expo-secure-store token persistence, and role-based route protection.'}
          </Text>

          <TouchableOpacity
            style={[
              styles.authActionButton,
              { backgroundColor: theme.primary },
            ]}
            onPress={() => router.push(isAuthenticated ? '/(app)' : '/(auth)/login')}
            accessibilityRole="button"
          >
            <Text style={styles.authActionButtonText}>
              {isAuthenticated ? 'Open Campus Dashboard' : 'Sign In with Campus Account'}
            </Text>
            <ArrowRight color="#FFFFFF" size={18} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>

        {/* Foundation Status Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Layers color={theme.primary} size={20} />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
              System Architecture
            </Text>
          </View>

          <View style={styles.specRow}>
            <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Framework</Text>
            <Text style={[styles.specValue, { color: theme.textPrimary }]}>React Native + Expo SDK 58</Text>
          </View>

          <View style={styles.specRow}>
            <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Navigation</Text>
            <Text style={[styles.specValue, { color: theme.textPrimary }]}>Expo Router (File-Based)</Text>
          </View>

          <View style={styles.specRow}>
            <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Runtime Platform</Text>
            <View style={styles.runtimePill}>
              <Smartphone color={theme.info} size={14} style={{ marginRight: 4 }} />
              <Text style={[styles.specValue, { color: theme.info, textTransform: 'capitalize' }]}>
                {config.platform}
              </Text>
            </View>
          </View>

          <View style={[styles.specRow, styles.specRowLast]}>
            <Text style={[styles.specLabel, { color: theme.textSecondary }]}>System Theme</Text>
            <Text style={[styles.specValue, { color: theme.textPrimary }]}>
              {theme.isDark ? 'Dark Mode (Active)' : 'Light Mode (Active)'}
            </Text>
          </View>
        </View>

        {/* Backend API Configuration Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Server color={theme.primary} size={20} />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
              Backend API Endpoint
            </Text>
          </View>

          <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
            Configured to communicate with the existing Node.js Express backend without duplicating business logic:
          </Text>

          <View style={[styles.codeBox, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}>
            <Text style={[styles.codeText, { color: theme.textPrimary }]} numberOfLines={1}>
              {config.apiUrl}
            </Text>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Config Source</Text>
              <Text style={[styles.metaValue, { color: config.isConfiguredViaEnv ? theme.success : theme.info }]}>
                {config.isConfiguredViaEnv ? 'EXPO_PUBLIC_API_URL (.env)' : 'Platform-Aware Fallback'}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={[styles.metaLabel, { color: theme.textMuted }]}>Backend Port</Text>
              <Text style={[styles.metaValue, { color: theme.textPrimary }]}>
                {config.backendPort}
              </Text>
            </View>
          </View>

          <View style={[styles.noticeBox, { backgroundColor: theme.surfaceSecondary }]}>
            <Info color={theme.info} size={16} style={{ marginTop: 2, marginRight: 8 }} />
            <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
              Android Emulators access the host computer via <Text style={{ fontWeight: '700' }}>10.0.2.2</Text>. Physical devices over Wi-Fi require the computer's LAN IP.
            </Text>
          </View>
        </View>

        {/* Roles & RBAC Contract Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Users color={theme.primary} size={20} />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
              Campus RBAC Roles Foundation
            </Text>
          </View>

          <Text style={[styles.cardDescription, { color: theme.textSecondary }]}>
            Prepared for role-based mobile navigation aligned with shared contracts:
          </Text>

          <View style={styles.rolesGrid}>
            {Object.values(ROLES).map((role) => (
              <View
                key={role}
                style={[
                  styles.rolePill,
                  {
                    backgroundColor: theme.surfaceSecondary,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={[styles.roleDot, { backgroundColor: ROLE_COLORS[role] }]} />
                <View>
                  <Text style={[styles.roleTitle, { color: theme.textPrimary }]}>
                    {ROLE_LABELS[role]}
                  </Text>
                  <Text style={[styles.roleCode, { color: theme.textMuted }]}>
                    {role}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Realtime Socket Readiness Card */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        >
          <View style={styles.cardHeader}>
            <Radio color={theme.success} size={20} />
            <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>
              Realtime Communication Ready
            </Text>
          </View>

          <View style={styles.checklist}>
            <View style={styles.checkItem}>
              <CheckCircle2 color={theme.success} size={18} style={styles.checkIcon} />
              <Text style={[styles.checkText, { color: theme.textSecondary }]}>
                Compatible with existing Socket.IO backend gateway
              </Text>
            </View>
            <View style={styles.checkItem}>
              <CheckCircle2 color={theme.success} size={18} style={styles.checkIcon} />
              <Text style={[styles.checkText, { color: theme.textSecondary }]}>
                Pre-configured for camera alerts, occupancy, and incidents
              </Text>
            </View>
            <View style={styles.checkItem}>
              <CheckCircle2 color={theme.success} size={18} style={styles.checkIcon} />
              <Text style={[styles.checkText, { color: theme.textSecondary }]}>
                Safe area and keyboard-aware UI architecture
              </Text>
            </View>
          </View>
        </View>

        {/* Footer Note */}
        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: theme.textMuted }]}>
            Step 1 Scope Completed: Expo Foundation & Architecture established. Login, authentication state, and role dashboards will be integrated in subsequent mobile steps.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  header: {
    alignItems: 'center',
    marginVertical: spacing.lg,
  },
  brandIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  appTitle: {
    fontSize: typography.title,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  appSubtitle: {
    fontSize: typography.heading,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    marginTop: 2,
  },
  badgeText: {
    fontSize: typography.caption,
    fontWeight: '600',
  },
  card: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },
  cardDescription: {
    fontSize: typography.body,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  specRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  specLabel: {
    fontSize: typography.body,
  },
  specValue: {
    fontSize: typography.body,
    fontWeight: '600',
  },
  runtimePill: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeBox: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: spacing.sm,
  },
  codeText: {
    fontFamily: Platform.select({ ios: 'Courier', default: 'monospace' }),
    fontSize: typography.body,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  metaItem: {
    flex: 1,
  },
  metaLabel: {
    fontSize: typography.caption,
    marginBottom: 2,
  },
  metaValue: {
    fontSize: typography.caption,
    fontWeight: '600',
  },
  noticeBox: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  noticeText: {
    fontSize: typography.caption,
    flex: 1,
    lineHeight: 16,
  },
  rolesGrid: {
    gap: spacing.sm,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  roleDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  roleTitle: {
    fontSize: typography.body,
    fontWeight: '600',
  },
  roleCode: {
    fontSize: typography.caption,
  },
  checklist: {
    gap: spacing.sm,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkIcon: {
    marginRight: spacing.sm,
  },
  checkText: {
    fontSize: typography.body,
    flex: 1,
  },
  footer: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  footerText: {
    fontSize: typography.caption,
    textAlign: 'center',
    lineHeight: 18,
  },
  authActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    minHeight: 46,
  },
  authActionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: typography.body,
  },
});
