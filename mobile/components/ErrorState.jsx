import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { AlertCircle, RefreshCw } from 'lucide-react-native';
import { useThemeColors, spacing, radius, typography } from '../constants/theme.js';

export default function ErrorState({
  title = 'Unable to Load Data',
  message = 'An error occurred while connecting to the campus backend server.',
  onRetry,
}) {
  const theme = useThemeColors();

  return (
    <View style={styles.container}>
      <View style={[styles.iconWrapper, { backgroundColor: theme.isDark ? '#3E1F1F' : '#FEF2F2' }]}>
        <AlertCircle color={theme.error} size={40} />
      </View>

      <Text style={[styles.title, { color: theme.textPrimary }]}>
        {title}
      </Text>

      <Text style={[styles.message, { color: theme.textSecondary }]}>
        {message}
      </Text>

      {onRetry && (
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: theme.primary }]}
          onPress={onRetry}
          accessibilityRole="button"
        >
          <RefreshCw color="#FFFFFF" size={16} style={{ marginRight: 6 }} />
          <Text style={styles.retryText}>Retry Connection</Text>
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
    maxWidth: 290,
    marginBottom: spacing.md,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.md,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: typography.body,
    fontWeight: '700',
  },
});
