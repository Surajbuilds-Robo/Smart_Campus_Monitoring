import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useThemeColors, spacing, radius, typography } from '../constants/theme.js';

export default function MetricCard({
  icon: IconComponent,
  iconColor,
  label,
  value,
  sublabel,
  onPress,
  badgeText,
  badgeColor,
  style,
}) {
  const theme = useThemeColors();
  const activeIconColor = iconColor || theme.primary;

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
        },
        style,
      ]}
    >
      <View style={styles.topRow}>
        <View style={[styles.iconWrapper, { backgroundColor: theme.surfaceSecondary }]}>
          {IconComponent && <IconComponent color={activeIconColor} size={20} />}
        </View>
        {badgeText && (
          <View style={[styles.badge, { backgroundColor: badgeColor || theme.surfaceSecondary }]}>
            <Text style={[styles.badgeText, { color: badgeColor ? '#FFFFFF' : theme.textSecondary }]}>
              {badgeText}
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={1}>
        {label}
      </Text>

      <Text style={[styles.value, { color: theme.textPrimary }]} numberOfLines={1}>
        {value}
      </Text>

      {sublabel && (
        <Text style={[styles.sublabel, { color: theme.textMuted }]} numberOfLines={1}>
          {sublabel}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={onPress}
        style={styles.touchable}
        accessibilityRole="button"
      >
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  touchable: {
    flex: 1,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    minHeight: 110,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: radius.full,
  },
  badgeText: {
    fontSize: typography.tiny,
    fontWeight: '700',
  },
  label: {
    fontSize: typography.caption,
    fontWeight: '500',
    marginTop: 2,
  },
  value: {
    fontSize: typography.title,
    fontWeight: '800',
    marginVertical: 2,
  },
  sublabel: {
    fontSize: typography.tiny,
  },
});
