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
import { useRouter } from 'expo-router';
import { Camera, MapPin, Building, Clock, ShieldCheck, Activity, Info } from 'lucide-react-native';

import HeaderBar from '../../components/HeaderBar.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import EmptyState from '../../components/EmptyState.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import { useThemeColors, spacing, radius, typography } from '../../constants/theme.js';
import { cameraApi } from '../../services/campusService.js';
import { formatTimestamp } from '../../utils/calculations.js';
import { getApiErrorMessage } from '../../services/apiClient.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useSocket } from '../../hooks/useSocket.js';
import { useSocketEvent } from '../../hooks/useSocketEvent.js';
import { validateCameraStatusPayload } from '../../utils/eventValidators.js';

export default function CamerasScreen() {
  const router = useRouter();
  const theme = useThemeColors();
  const { isStaff } = useAuth();
  const { reconnectCount } = useSocket();

  const [cameras, setCameras] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Role gating: staff only
  useEffect(() => {
    if (!isStaff) {
      router.replace('/(app)/unauthorized');
    }
  }, [isStaff, router]);

  const fetchCameras = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const data = await cameraApi.list();
      setCameras(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to retrieve CCTV camera feeds.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isStaff) {
      fetchCameras();
    }
  }, [isStaff, fetchCameras]);

  // Resynchronize camera inventory and statuses upon reconnection
  useEffect(() => {
    if (isStaff && reconnectCount > 0) {
      fetchCameras(true);
    }
  }, [isStaff, reconnectCount, fetchCameras]);

  // Handle live camera status updates
  useSocketEvent('camera:status', (payload) => {
    if (!isStaff) return;
    const valid = validateCameraStatusPayload(payload);
    if (!valid) return;

    setCameras((prevCameras) => {
      const targetId = String(valid.id || valid.cameraId);
      return prevCameras.map((camera) => {
        if (String(camera.id || camera._id || camera.cameraId) === targetId) {
          return {
            ...camera,
            status: valid.status,
            lastHeartbeat: valid.lastHeartbeat || camera.lastHeartbeat,
          };
        }
        return camera;
      });
    });
  });

  if (!isStaff) return null;

  const totalCount = cameras.length;
  const onlineCount = cameras.filter((c) => c.status === 'online').length;
  const offlineCount = cameras.filter((c) => c.status === 'offline').length;

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <HeaderBar
        title="CCTV Cameras"
        subtitle="Edge detection node health & telemetry"
      />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading camera feed status...
          </Text>
        </View>
      ) : errorMessage ? (
        <ErrorState
          title="Camera Telemetry Unavailable"
          message={errorMessage}
          onRetry={() => fetchCameras(false)}
        />
      ) : cameras.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No Cameras Provisioned"
          message="No active surveillance cameras are currently registered for your scope."
          onRetry={() => fetchCameras(true)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchCameras(true)}
              tintColor={theme.primary}
            />
          }
        >
          {/* Summary Health Card */}
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
                <Activity color="#FFFFFF" size={20} />
              </View>
              <View style={styles.summaryTitleBox}>
                <Text style={[styles.summaryTitle, { color: theme.textPrimary }]}>
                  Surveillance Network Health
                </Text>
                <Text style={[styles.summarySubtitle, { color: theme.textSecondary }]}>
                  {onlineCount} of {totalCount} edge nodes active
                </Text>
              </View>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: theme.textPrimary }]}>{totalCount}</Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Total</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: theme.success }]}>{onlineCount}</Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Online</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statBox}>
                <Text style={[styles.statValue, { color: offlineCount > 0 ? theme.error : theme.textMuted }]}>
                  {offlineCount}
                </Text>
                <Text style={[styles.statLabel, { color: theme.textMuted }]}>Offline</Text>
              </View>
            </View>

            <View style={[styles.noticeBanner, { backgroundColor: theme.surfaceSecondary }]}>
              <Info color={theme.info} size={14} style={{ marginRight: 6, marginTop: 2 }} />
              <Text style={[styles.noticeText, { color: theme.textSecondary }]}>
                Hardware connection telemetry from backend. Unsecured RTSP streaming credentials are not stored or exposed on mobile clients.
              </Text>
            </View>
          </View>

          {/* Section Heading */}
          <Text style={[styles.sectionHeading, { color: theme.textPrimary }]}>
            Camera Nodes ({totalCount})
          </Text>

          {/* Camera Cards */}
          {cameras.map((cam) => {
            const isOnline = cam.status === 'online';
            const isMaintenance = cam.status === 'maintenance';

            let statusColor = theme.error;
            let statusLabel = 'Offline';

            if (isOnline) {
              statusColor = theme.success;
              statusLabel = 'Online';
            } else if (isMaintenance) {
              statusColor = theme.warning;
              statusLabel = 'Maintenance';
            }

            return (
              <View
                key={cam._id || cam.id || cam.cameraId}
                style={[
                  styles.camCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
              >
                <View style={styles.camHeader}>
                  <View style={styles.camNameBox}>
                    <Text style={[styles.camName, { color: theme.textPrimary }]} numberOfLines={1}>
                      {cam.name}
                    </Text>
                    <Text style={[styles.camId, { color: theme.primary }]}>
                      {cam.cameraId}
                    </Text>
                  </View>
                  <StatusBadge
                    label={statusLabel}
                    color={statusColor}
                    textColor="#FFFFFF"
                  />
                </View>

                {/* Location & Building */}
                <View style={styles.infoRow}>
                  <MapPin color={theme.textMuted} size={14} style={{ marginRight: 6 }} />
                  <Text style={[styles.infoText, { color: theme.textSecondary }]} numberOfLines={1}>
                    {cam.location} {cam.building ? `• ${cam.building}` : ''}
                  </Text>
                </View>

                {/* Heartbeat Timestamp */}
                <View style={styles.infoRow}>
                  <Clock color={theme.textMuted} size={14} style={{ marginRight: 6 }} />
                  <Text style={[styles.infoText, { color: theme.textMuted }]}>
                    Last Heartbeat: {formatTimestamp(cam.lastHeartbeat || cam.updatedAt)}
                  </Text>
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginVertical: spacing.sm,
  },
  statBox: {
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
  noticeBanner: {
    flexDirection: 'row',
    padding: spacing.sm,
    borderRadius: radius.sm,
    marginTop: spacing.xs,
  },
  noticeText: {
    fontSize: typography.tiny,
    lineHeight: 16,
    flex: 1,
  },
  sectionHeading: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  camCard: {
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
  camHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  camNameBox: {
    flex: 1,
    marginRight: spacing.sm,
  },
  camName: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  camId: {
    fontSize: typography.tiny,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  infoText: {
    fontSize: typography.caption,
  },
});
