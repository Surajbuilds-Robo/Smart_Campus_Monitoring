import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Users, Camera, Clock, ShieldAlert } from 'lucide-react-native';

import HeaderBar from '../../components/HeaderBar.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import { useThemeColors, spacing, radius, typography } from '../../constants/theme.js';
import { occupancyApi } from '../../services/campusService.js';
import { computePercentage, getCrowdStatus, formatTimestamp } from '../../utils/calculations.js';
import { getApiErrorMessage } from '../../services/apiClient.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useSocket } from '../../hooks/useSocket.js';
import { useSocketEvent } from '../../hooks/useSocketEvent.js';
import { validateOccupancyPayload } from '../../utils/eventValidators.js';

export default function OccupancyScreen() {
  const theme = useThemeColors();
  const { isStudent } = useAuth();
  const { reconnectCount } = useSocket();

  const [occupancyRecords, setOccupancyRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchOccupancy = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const data = await occupancyApi.list();
      setOccupancyRecords(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to retrieve occupancy records.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOccupancy();
  }, [fetchOccupancy]);

  // Resynchronize authoritative occupancy data upon reconnection
  useEffect(() => {
    if (reconnectCount > 0) {
      fetchOccupancy(true);
    }
  }, [reconnectCount, fetchOccupancy]);

  // Handle live occupancy updates
  useSocketEvent('occupancy:updated', (payload) => {
    const valid = validateOccupancyPayload(payload);
    if (!valid) return;

    setOccupancyRecords((prevRecords) => {
      const targetId = String(valid.id || valid.zoneName);
      const index = prevRecords.findIndex(
        (r) => String(r.id || r._id || r.zoneName) === targetId
      );

      if (index >= 0) {
        const next = [...prevRecords];
        next[index] = { ...next[index], ...valid };
        return next;
      }

      return [valid, ...prevRecords];
    });
  });

  // Aggregate stats
  const totalPeople = occupancyRecords.reduce((sum, r) => sum + (Number(r.peopleCount) || 0), 0);
  const totalCapacity = occupancyRecords.reduce((sum, r) => sum + (Number(r.capacity) || 0), 0);
  const overallPercentage = computePercentage(totalPeople, totalCapacity);
  const overallStatus = getCrowdStatus(overallPercentage);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <HeaderBar
        title="Crowd Density"
        subtitle="Live campus zone occupancy metrics"
      />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading crowd density telemetry...
          </Text>
        </View>
      ) : errorMessage ? (
        <ErrorState
          title="Occupancy Telemetry Unavailable"
          message={errorMessage}
          onRetry={() => fetchOccupancy(false)}
        />
      ) : occupancyRecords.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Occupancy Data"
          message="No active zone occupancy observations are currently reported by the system."
          onRetry={() => fetchOccupancy(true)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchOccupancy(true)}
              tintColor={theme.primary}
            />
          }
        >
          {/* Summary Card */}
          <View
            style={[
              styles.summaryCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.summaryHeader}>
              <View style={[styles.summaryIconBox, { backgroundColor: overallStatus.color }]}>
                <Users color="#FFFFFF" size={20} />
              </View>
              <View style={styles.summaryTitleBox}>
                <Text style={[styles.summaryTitle, { color: theme.textPrimary }]}>
                  Campus Monitored Zones
                </Text>
                <Text style={[styles.summarySubtitle, { color: theme.textSecondary }]}>
                  {totalPeople} people counted ({overallPercentage}% capacity)
                </Text>
              </View>
              <StatusBadge
                label={overallStatus.label}
                color={overallStatus.color}
                textColor="#FFFFFF"
              />
            </View>

            {/* Overall Progress Bar */}
            <View style={[styles.progressBarTrack, { backgroundColor: theme.surfaceSecondary }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${overallPercentage}%`,
                    backgroundColor: overallStatus.color,
                  },
                ]}
              />
            </View>

            <View style={styles.summaryFooterRow}>
              <Text style={[styles.footerNotice, { color: theme.textMuted }]}>
                {isStudent
                  ? 'Showing sanitized public occupancy for approved campus study spaces.'
                  : 'Thresholds: Warning >= 70% | Critical >= 90% per shared campus rules.'}
              </Text>
            </View>
          </View>

          {/* Section Heading */}
          <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>
            Monitored Campus Zones ({occupancyRecords.length})
          </Text>

          {/* Zone Cards */}
          {occupancyRecords.map((item) => {
            const people = Number(item.peopleCount) || 0;
            const capacity = Number(item.capacity) || 0;
            const percentage = computePercentage(people, capacity);
            const statusInfo = getCrowdStatus(percentage);

            return (
              <View
                key={item._id || item.id || `${item.zoneName}-${item.observedAt}`}
                style={[
                  styles.zoneCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={styles.zoneHeader}>
                  <View style={styles.zoneNameContainer}>
                    <Text style={[styles.zoneName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {item.zoneName}
                    </Text>
                    {item.camera && typeof item.camera === 'object' && (
                      <View style={styles.cameraRow}>
                        <Camera color={theme.textMuted} size={12} style={{ marginRight: 4 }} />
                        <Text style={[styles.cameraText, { color: theme.textMuted }]} numberOfLines={1}>
                          {item.camera.name || item.camera.cameraId} • {item.camera.location}
                        </Text>
                      </View>
                    )}
                  </View>
                  <StatusBadge
                    label={statusInfo.label}
                    color={statusInfo.color}
                    textColor="#FFFFFF"
                  />
                </View>

                {/* Metrics & Ratio */}
                <View style={styles.metricRow}>
                  <Text style={[styles.metricCount, { color: theme.textPrimary }]}>
                    <Text style={{ fontWeight: '800', color: statusInfo.color }}>{people}</Text>
                    <Text style={{ color: theme.textSecondary }}> / {capacity} people</Text>
                  </Text>
                  <Text style={[styles.metricPercent, { color: theme.textSecondary }]}>
                    {percentage}% density
                  </Text>
                </View>

                {/* Progress Bar */}
                <View style={[styles.progressBarTrack, { backgroundColor: theme.surfaceSecondary }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${percentage}%`,
                        backgroundColor: statusInfo.color,
                      },
                    ]}
                  />
                </View>

                {/* Footer Timestamp */}
                <View style={styles.zoneFooter}>
                  <View style={styles.timeRow}>
                    <Clock color={theme.textMuted} size={13} style={{ marginRight: 4 }} />
                    <Text style={[styles.timeText, { color: theme.textMuted }]}>
                      Observed {formatTimestamp(item.observedAt)}
                    </Text>
                  </View>

                  {percentage >= 90 && (
                    <View style={styles.warningRow}>
                      <ShieldAlert color={theme.error} size={14} style={{ marginRight: 4 }} />
                      <Text style={[styles.warningText, { color: theme.error }]}>
                        Overcrowding alert
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: typography.body,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  summaryIconBox: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  summaryTitleBox: {
    flex: 1,
  },
  summaryTitle: {
    fontSize: typography.heading,
    fontWeight: '700',
  },
  summarySubtitle: {
    fontSize: typography.caption,
    marginTop: 2,
  },
  progressBarTrack: {
    height: 8,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginVertical: spacing.sm,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: radius.full,
  },
  summaryFooterRow: {
    marginTop: spacing.xs,
  },
  footerNotice: {
    fontSize: typography.tiny,
    lineHeight: 16,
  },
  sectionHeading: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  zoneCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  zoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  zoneNameContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  zoneName: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  cameraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  cameraText: {
    fontSize: typography.tiny,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  metricCount: {
    fontSize: typography.body,
  },
  metricPercent: {
    fontSize: typography.caption,
    fontWeight: '600',
  },
  zoneFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontSize: typography.caption,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  warningText: {
    fontSize: typography.tiny,
    fontWeight: '700',
  },
});
