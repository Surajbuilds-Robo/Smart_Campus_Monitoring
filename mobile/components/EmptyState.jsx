import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Inbox, RefreshCw } from 'lucide-react-native';
import { useThemeColors, spacing, radius, typography } from '../constants/theme.js';

export default function EmptyState({
  icon: IconComponent = Inbox,
  title = 'No Data Available',
  message = 'There are no active records in this category right now.',
  onRetry,
  retryLabel = 'Refresh',
}) {
  const theme = useThemeColors();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrapper, { backgroundColor: theme.surfaceSecondary }]}>
        <IconComponent color={theme.textMuted} size={40} />
      </View>

      <Text style={[styles.title, { color: theme.textPrimary }]}>
        {title}
      </Text>

      <Text style={[styles.message, { color: theme.textSecondary }]}>
        {message}
      </Text>

      {onRetry && (
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: theme.surfaceSecondary, borderColor: theme.border }]}
          onPress={onRetry}
          accessibilityRole="button"
        >
          <RefreshCw color={theme.primary} size={16} style={{ marginRight: 6 }} />
          <Text style={[styles.retryText, { color: theme.primary }]}>
            {retryLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  iconWrapper: {
    width: 72,
    height: 72,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  message: {
    fontSize: typography.body,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: spacing.md,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.md,
  },
  retryText: {
    fontSize: typography.body,
    fontWeight: '600',
  },
});
