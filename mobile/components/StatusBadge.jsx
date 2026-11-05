import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { spacing, radius, typography } from '../constants/theme.js';

export default function StatusBadge({ label, color = '#2563EB', textColor = '#FFFFFF', style }) {
  if (!label) return null;

  return (
    <View style={[styles.badge, { backgroundColor: color }, style]}>
      <Text style={[styles.badgeText, { color: textColor }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: typography.tiny,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
