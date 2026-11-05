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
import { Car, MapPin, Building, Clock, CheckCircle, AlertOctagon } from 'lucide-react-native';

import HeaderBar from '../../components/HeaderBar.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import { useThemeColors, spacing, radius, typography } from '../../constants/theme.js';
import { parkingApi } from '../../services/campusService.js';
import { computePercentage, formatTimestamp } from '../../utils/calculations.js';
import { getApiErrorMessage } from '../../services/apiClient.js';
import { useSocket } from '../../hooks/useSocket.js';
import { useSocketEvent } from '../../hooks/useSocketEvent.js';
import { validateParkingPayload } from '../../utils/eventValidators.js';

export default function ParkingScreen() {
  const theme = useThemeColors();
  const { reconnectCount } = useSocket();

  const [parkingLots, setParkingLots] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const fetchParking = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const data = await parkingApi.list();
      setParkingLots(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to retrieve parking availability.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchParking();
  }, [fetchParking]);

  // Resynchronize fresh authoritative data upon reconnection
  useEffect(() => {
    if (reconnectCount > 0) {
      fetchParking(true);
    }
  }, [reconnectCount, fetchParking]);

  // Handle live parking updates
  useSocketEvent('parking:updated', (payload) => {
    const valid = validateParkingPayload(payload);
    if (!valid) return;

    setParkingLots((prevLots) => {
      const targetId = String(valid.id || valid.zoneId);
      const index = prevLots.findIndex(
        (p) => String(p.id || p._id || p.zoneId) === targetId
      );

      if (index >= 0) {
        const next = [...prevLots];
        next[index] = { ...next[index], ...valid };
        return next;
      }

      return [valid, ...prevLots];
    });
  });

  // Aggregate stats
  const totalCapacity = parkingLots.reduce((sum, p) => sum + (Number(p.totalSpaces) || 0), 0);
  const totalOccupied = parkingLots.reduce((sum, p) => sum + (Number(p.occupiedSpaces) || 0), 0);
  const totalAvailable = parkingLots.reduce(
    (sum, p) => sum + (Number(p.availableSpaces ?? (p.totalSpaces - p.occupiedSpaces)) || 0),
    0
  );
  const occupancyPercentage = computePercentage(totalOccupied, totalCapacity);
  const availabilityPercentage = computePercentage(totalAvailable, totalCapacity);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <HeaderBar
        title="Parking Availability"
        subtitle="Real-time campus lots & structures"
      />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading live parking availability...
          </Text>
        </View>
      ) : errorMessage ? (
        <ErrorState
          title="Parking Service Unavailable"
          message={errorMessage}
          onRetry={() => fetchParking(false)}
        />
      ) : parkingLots.length === 0 ? (
        <EmptyState
          icon={Car}
          title="No Parking Lots Active"
          message="No active campus parking structures or lots are currently reported by the server."
          onRetry={() => fetchParking(true)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchParking(true)}
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
              <View style={[styles.summaryIconBox, { backgroundColor: theme.primary }]}>
                <Car color="#FFFFFF" size={20} />
              </View>
              <View style={styles.summaryTitleBox}>
                <Text style={[styles.summaryTitle, { color: theme.textPrimary }]}>
                  Campus Overall Capacity
                </Text>
                <Text style={[styles.summarySubtitle, { color: theme.textSecondary }]}>
                  {totalAvailable} of {totalCapacity} spaces open ({availabilityPercentage}%)
                </Text>
              </View>
            </View>

            {/* Overall Progress Bar */}
            <View style={[styles.progressBarTrack, { backgroundColor: theme.surfaceSecondary }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${occupancyPercentage}%`,
                    backgroundColor:
                      occupancyPercentage >= 90
                        ? theme.error
                        : occupancyPercentage >= 70
                        ? theme.warning
                        : theme.success,
                  },
                ]}
              />
            </View>

            <View style={styles.summaryStatsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.textPrimary }]}>
                  {totalCapacity}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>
                  Total
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.warning }]}>
                  {totalOccupied}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>
                  Occupied
                </Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: theme.success }]}>
                  {totalAvailable}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>
                  Available
                </Text>
              </View>
            </View>
          </View>

          {/* Section Title */}
          <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>
            Campus Lots ({parkingLots.length})
          </Text>

          {/* Lot Cards */}
          {parkingLots.map((lot) => {
            const lotTotal = Number(lot.totalSpaces) || 0;
            const lotOccupied = Number(lot.occupiedSpaces) || 0;
            const lotAvailable = Number(
              lot.availableSpaces !== undefined ? lot.availableSpaces : Math.max(0, lotTotal - lotOccupied)
            );
            const lotOccupancyPct = computePercentage(lotOccupied, lotTotal);

            const isFull = lot.status === 'full' || lotAvailable === 0;
            const isUnavailable = lot.status === 'unavailable';

            let statusColor = theme.success;
            let statusLabel = 'Available';

            if (isUnavailable) {
              statusColor = theme.textMuted;
              statusLabel = 'Unavailable';
            } else if (isFull) {
              statusColor = theme.error;
              statusLabel = 'Full';
            } else if (lotOccupancyPct >= 80) {
              statusColor = theme.warning;
              statusLabel = 'Nearly Full';
            }

            return (
              <View
                key={lot._id || lot.id || lot.zoneId}
                style={[
                  styles.lotCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={styles.lotHeader}>
                  <View style={styles.lotNameContainer}>
                    <Text style={[styles.lotName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {lot.name}
                    </Text>
                    <Text style={[styles.lotZone, { color: theme.textMuted }]}>
                      {lot.zoneId}
                    </Text>
                  </View>
                  <StatusBadge
                    label={statusLabel}
                    color={statusColor}
                    textColor="#FFFFFF"
                  />
                </View>

                {/* Metrics & Progress */}
                <View style={styles.lotMetricRow}>
                  <Text style={[styles.lotMetricCount, { color: theme.textPrimary }]}>
                    <Text style={{ fontWeight: '800', color: statusColor }}>{lotAvailable}</Text>
                    <Text style={{ color: theme.textSecondary }}> / {lotTotal} spaces free</Text>
                  </Text>
                  <Text style={[styles.lotPercent, { color: theme.textSecondary }]}>
                    {lotOccupancyPct}% filled
                  </Text>
                </View>

                <View style={[styles.progressBarTrack, { backgroundColor: theme.surfaceSecondary }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${lotOccupancyPct}%`,
                        backgroundColor: statusColor,
                      },
                    ]}
                  />
                </View>

                {/* Metadata Details */}
                <View style={styles.lotFooter}>
                  <View style={styles.metaRow}>
                    <MapPin color={theme.textMuted} size={14} style={{ marginRight: 4 }} />
                    <Text style={[styles.metaText, { color: theme.textSecondary }]} numberOfLines={1}>
                      {lot.location} {lot.building ? `• ${lot.building}` : ''}
                    </Text>
                  </View>

                  <View style={styles.metaRow}>
                    <Clock color={theme.textMuted} size={14} style={{ marginRight: 4 }} />
                    <Text style={[styles.metaText, { color: theme.textMuted }]}>
                      {formatTimestamp(lot.lastUpdatedAt || lot.updatedAt)}
                    </Text>
                  </View>
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
  summaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: spacing.sm,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: typography.subtitle,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: typography.caption,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(150, 150, 150, 0.2)',
  },
  sectionHeading: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  lotCard: {
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
  lotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  lotNameContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  lotName: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  lotZone: {
    fontSize: typography.tiny,
    marginTop: 2,
  },
  lotMetricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  lotMetricCount: {
    fontSize: typography.body,
  },
  lotPercent: {
    fontSize: typography.caption,
    fontWeight: '600',
  },
  lotFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: typography.caption,
  },
});
