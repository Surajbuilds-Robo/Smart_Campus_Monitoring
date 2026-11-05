import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { ShieldAlert, ArrowLeft } from 'lucide-react-native';

import { useThemeColors, spacing, radius, typography } from '../../constants/theme';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_LABELS } from '../../constants/roles';

export default function UnauthorizedScreen() {
  const router = useRouter();
  const theme = useThemeColors();
  const { user } = useAuth();

  const roleLabel = user?.role ? (ROLE_LABELS[user.role] || user.role) : 'Current Role';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.iconWrapper, { backgroundColor: theme.isDark ? '#3E1F1F' : '#FEF2F2' }]}>
        <ShieldAlert color={theme.error} size={48} />
      </View>

      <Text style={[styles.title, { color: theme.textPrimary }]}>
        Access Restricted
      </Text>

      <Text style={[styles.description, { color: theme.textSecondary }]}>
        Your account role ({roleLabel}) does not have permission to access this campus module.
      </Text>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: theme.primary }]}
        onPress={() => router.replace('/(app)')}
        accessibilityRole="button"
      >
        <ArrowLeft color="#FFFFFF" size={18} style={styles.buttonIcon} />
        <Text style={styles.buttonText}>Return to Dashboard</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  iconWrapper: {
    padding: spacing.lg,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.title,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  description: {
    fontSize: typography.body,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 20,
    maxWidth: 300,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.md,
    minHeight: 44,
  },
  buttonIcon: {
    marginRight: spacing.sm,
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: typography.body,
  },
});
