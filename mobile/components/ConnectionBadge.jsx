import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSocket } from '../hooks/useSocket.js';
import { useThemeColors, radius, spacing, typography } from '../constants/theme.js';

export default function ConnectionBadge({ showText = true }) {
  const theme = useThemeColors();
  const { connected } = useSocket();

  const dotColor = connected ? '#10B981' : '#F59E0B';
  const label = connected ? 'Live' : 'Offline';
  const badgeBg = connected
    ? theme.isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.1)'
    : theme.isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)';

  return (
    <View style={[styles.badge, { backgroundColor: badgeBg }]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      {showText && (
        <Text style={[styles.text, { color: dotColor }]}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 4,
  },
  text: {
    fontSize: typography.small || 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
