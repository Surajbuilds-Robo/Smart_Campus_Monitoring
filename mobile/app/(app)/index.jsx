import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  Shield,
  LogOut,
  Car,
  Users,
  Camera,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  Bell,
  Sparkles,
  Info,
  X,
  CheckCheck,
} from 'lucide-react-native';

import MetricCard from '../../components/MetricCard.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import ErrorState from '../../components/ErrorState.jsx';
import ConnectionBadge from '../../components/ConnectionBadge.jsx';
import { useThemeColors, spacing, radius, typography } from '../../constants/theme.js';
import { useAuth } from '../../hooks/useAuth.js';
import { useSocket } from '../../hooks/useSocket.js';
import { useSocketEvent } from '../../hooks/useSocketEvent.js';
import { ROLE_LABELS, ROLE_COLORS, ROLES } from '../../constants/roles.js';
import { getDashboardSummary, notificationApi } from '../../services/campusService.js';
import {
  validateCameraStatusPayload,
  validateParkingPayload,
  validateOccupancyPayload,
  validateIncidentCreatedPayload,
  validateIncidentUpdatedPayload,
  validateNotificationPayload,
} from '../../utils/eventValidators.js';
import {
  isDuplicateNotification,
  resolveNotificationRoute,
} from '../../services/notificationService.js';
import {
  computePercentage,
  getCrowdStatus,
  formatIncidentEventType,
  getSeverityColor,
  getStatusColor,
  formatTimestamp,
} from '../../utils/calculations.js';

export default function DashboardScreen() {
  const router = useRouter();
  const theme = useThemeColors();
  const { user, logout, isStaff, isAdmin, isSuperAdmin, isStudent } = useAuth();
  const { reconnectCount } = useSocket();

  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // In-app notifications
  const [notifications, setNotifications] = useState([]);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  const userRole = user?.role || ROLES.STUDENT;
  const roleLabel = ROLE_LABELS[userRole] || userRole;
  const roleColor = ROLE_COLORS[userRole] || theme.primary;

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const data = await getDashboardSummary(user);
      setDashboardData(data);
    } catch (err) {
      setErrorMessage('Failed to connect to campus services. Pull to retry.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user]);

  const fetchNotifications = useCallback(async () => {
    try {
      const list = await notificationApi.list({ limit: 20 });
      setNotifications(Array.isArray(list) ? list : []);
    } catch {
      // Non-fatal if offline
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
    fetchNotifications();
  }, [fetchDashboard, fetchNotifications]);

  // Resynchronize upon network reconnection
  useEffect(() => {
    if (reconnectCount > 0) {
      fetchDashboard(true);
      fetchNotifications();
    }
  }, [reconnectCount, fetchDashboard, fetchNotifications]);

  // Handle live parking updates
  useSocketEvent('parking:updated', (payload) => {
    const valid = validateParkingPayload(payload);
    if (!valid) return;

    setDashboardData((prev) => {
      if (!prev) return prev;
      const targetId = String(valid.id || valid.zoneId);
      const currentLots = prev.parking || [];
      const index = currentLots.findIndex(
        (p) => String(p.id || p._id || p.zoneId) === targetId
      );

      const nextLots =
        index >= 0
          ? currentLots.map((p, idx) => (idx === index ? { ...p, ...valid } : p))
          : [valid, ...currentLots];

      const totalParkingCapacity = nextLots.reduce(
        (sum, p) => sum + (Number(p.totalSpaces) || 0),
        0
      );
      const totalOccupiedParking = nextLots.reduce(
        (sum, p) => sum + (Number(p.occupiedSpaces) || 0),
        0
      );
      const totalAvailableParking = nextLots.reduce(
        (sum, p) => sum + (Number(p.availableSpaces ?? (p.totalSpaces - p.occupiedSpaces)) || 0),
        0
      );

      return {
        ...prev,
        parking: nextLots,
        metrics: {
          ...prev.metrics,
          totalParkingCapacity,
          totalOccupiedParking,
          totalAvailableParking,
        },
      };
    });
  });

  // Handle live occupancy updates
  useSocketEvent('occupancy:updated', (payload) => {
    const valid = validateOccupancyPayload(payload);
    if (!valid) return;

    setDashboardData((prev) => {
      if (!prev) return prev;
      const targetId = String(valid.id || valid.zoneName);
      const currentOcc = prev.occupancy || [];
      const index = currentOcc.findIndex(
        (o) => String(o.id || o._id || o.zoneName) === targetId
      );

      const nextOcc =
        index >= 0
          ? currentOcc.map((o, idx) => (idx === index ? { ...o, ...valid } : o))
          : [valid, ...currentOcc];

      return {
        ...prev,
        occupancy: nextOcc,
      };
    });
  });

  // Handle live camera status updates
  useSocketEvent('camera:status', (payload) => {
    if (!isStaff) return;
    const valid = validateCameraStatusPayload(payload);
    if (!valid) return;

    setDashboardData((prev) => {
      if (!prev) return prev;
      const targetId = String(valid.id || valid.cameraId);
      const currentCams = prev.cameras || [];
      const nextCams = currentCams.map((c) => {
        if (String(c.id || c._id || c.cameraId) === targetId) {
          return { ...c, status: valid.status, lastHeartbeat: valid.lastHeartbeat };
        }
        return c;
      });

      const onlineCameras = nextCams.filter((c) => c.status === 'online').length;

      return {
        ...prev,
        cameras: nextCams,
        metrics: {
          ...prev.metrics,
          onlineCameras,
        },
      };
    });
  });

  // Handle live incident creation
  useSocketEvent('incident:created', (payload) => {
    if (!isStaff) return;
    const valid = validateIncidentCreatedPayload(payload);
    if (!valid) return;

    setDashboardData((prev) => {
      if (!prev) return prev;
      const targetId = String(valid.id || valid.incidentId);
      const currentIncidents = prev.incidents || [];
      if (currentIncidents.some((i) => String(i.id || i._id || i.incidentId) === targetId)) {
        return prev;
      }

      const nextIncidents = [valid, ...currentIncidents];
      const openCount = (prev.metrics?.openIncidentsCount || 0) + 1;
      const critCount =
        valid.severity === 'critical'
          ? (prev.metrics?.criticalIncidentsCount || 0) + 1
          : prev.metrics?.criticalIncidentsCount || 0;

      return {
        ...prev,
        incidents: nextIncidents,
        metrics: {
          ...prev.metrics,
          openIncidentsCount: openCount,
          criticalIncidentsCount: critCount,
        },
      };
    });
  });

  // Handle live incident updates
  useSocketEvent('incident:updated', (payload) => {
    if (!isStaff) return;
    const valid = validateIncidentUpdatedPayload(payload);
    if (!valid) return;

    setDashboardData((prev) => {
      if (!prev) return prev;
      const targetId = String(valid.id || valid.incidentId);
      const currentIncidents = prev.incidents || [];
      const nextIncidents = currentIncidents.map((i) => {
        if (String(i.id || i._id || i.incidentId) === targetId) {
          return {
            ...i,
            status: valid.status || i.status,
            assignedTo: valid.assignedTo !== undefined ? valid.assignedTo : i.assignedTo,
            updatedAt: valid.updatedAt || i.updatedAt,
          };
        }
        return i;
      });

      const openIncidents = nextIncidents.filter((i) =>
        ['new', 'acknowledged', 'investigating'].includes(i.status)
      );
      const criticalIncidents = nextIncidents.filter(
        (i) =>
          i.severity === 'critical' && ['new', 'acknowledged', 'investigating'].includes(i.status)
      );

      return {
        ...prev,
        incidents: nextIncidents,
        metrics: {
          ...prev.metrics,
          openIncidentsCount: openIncidents.length,
          criticalIncidentsCount: criticalIncidents.length,
        },
      };
    });
  });

  // Handle live notifications directed to this user
  useSocketEvent('notification:created', (payload) => {
    const valid = validateNotificationPayload(payload);
    if (!valid) return;

    if (isDuplicateNotification(valid.id)) {
      return;
    }

    setNotifications((prev) => [valid, ...prev]);
  });

  const handleSignOut = async () => {
    await logout();
    router.replace('/(auth)/login');
  };

  const handleMarkAllNotificationsRead = async () => {
    try {
      await notificationApi.markAllRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() }))
      );
    } catch {
      // Safe fallback
    }
  };

  const handleNotificationPress = async (item) => {
    try {
      if (!item.readAt) {
        await notificationApi.markRead(item._id || item.id);
        setNotifications((prev) =>
          prev.map((n) =>
            (n._id || n.id) === (item._id || item.id)
              ? { ...n, readAt: new Date().toISOString() }
              : n
          )
        );
      }
    } catch {
      // Safe fallback
    }

    setShowNotificationsModal(false);
    const targetRoute = resolveNotificationRoute(item);
    if (targetRoute) {
      router.push(targetRoute);
    }
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  const metrics = dashboardData?.metrics || {
    totalParkingCapacity: 0,
    totalOccupiedParking: 0,
    totalAvailableParking: 0,
    totalCameras: 0,
    onlineCameras: 0,
    openIncidentsCount: 0,
    criticalIncidentsCount: 0,
  };

  // Crowd density metrics
  const occupancyList = dashboardData?.occupancy || [];
  const totalOccupancyPeople = occupancyList.reduce((sum, o) => sum + (Number(o.peopleCount) || 0), 0);
  const totalOccupancyCapacity = occupancyList.reduce((sum, o) => sum + (Number(o.capacity) || 0), 0);
  const crowdPercentage = computePercentage(totalOccupancyPeople, totalOccupancyCapacity);
  const crowdStatus = getCrowdStatus(crowdPercentage);

  // Recent incidents (for staff)
  const recentIncidents = (dashboardData?.incidents || []).slice(0, 3);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      {/* Top Bar with Profile Info & Sign Out */}
      <View style={[styles.topBar, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.userSection}>
          <Text style={[styles.greetingSub, { color: theme.textSecondary }]}>
            Campus Portal • {roleLabel}
          </Text>
          <Text style={[styles.greetingName, { color: theme.textPrimary }]} numberOfLines={1}>
            {user?.name || 'Campus Member'}
          </Text>
        </View>

        <View style={styles.topActions}>
          <ConnectionBadge showText={false} />

          <TouchableOpacity
            style={[styles.iconButton, { borderColor: theme.border, marginLeft: 6 }]}
            onPress={() => setShowNotificationsModal(true)}
            accessibilityRole="button"
            accessibilityLabel="Campus Notifications"
          >
            <Bell color={theme.textPrimary} size={18} />
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={[styles.rolePill, { backgroundColor: roleColor, marginLeft: 6 }]}>
            <Shield color="#FFFFFF" size={14} style={{ marginRight: 4 }} />
            <Text style={styles.rolePillText}>{userRole}</Text>
          </View>

          <TouchableOpacity
            style={[styles.iconButton, { borderColor: theme.border, marginLeft: 6 }]}
            onPress={handleSignOut}
            accessibilityRole="button"
            accessibilityLabel="Sign Out"
          >
            <LogOut color={theme.error} size={18} />
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading campus operational metrics...
          </Text>
        </View>
      ) : errorMessage && !dashboardData ? (
        <ErrorState
          title="Campus Data Offline"
          message={errorMessage}
          onRetry={() => fetchDashboard(false)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchDashboard(true)}
              tintColor={theme.primary}
            />
          }
        >
          {/* Welcome Banner */}
          <View
            style={[
              styles.welcomeBanner,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.bannerIconBox}>
              <Sparkles color={theme.primary} size={22} />
            </View>
            <View style={styles.bannerTextBox}>
              <Text style={[styles.bannerTitle, { color: theme.textPrimary }]}>
                {isStudent
                  ? 'Student Campus Services'
                  : isSuperAdmin
                  ? 'Global Operations Hub'
                  : isAdmin
                  ? 'Department Operations Hub'
                  : 'Faculty Operational Feeds'}
              </Text>
              <Text style={[styles.bannerDescription, { color: theme.textSecondary }]}>
                {isStudent
                  ? 'Real-time parking space availability and library/cafeteria crowd density.'
                  : 'Centralized telemetry from edge AI detectors, parking zones, and surveillance cameras.'}
              </Text>
            </View>
          </View>

          {/* Section: Operational Metrics Grid */}
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            Active Campus Metrics
          </Text>

          {isStudent ? (
            /* Student-Specific 2x2 Metric Cards */
            <View style={styles.metricsGrid}>
              <View style={styles.metricRow}>
                <MetricCard
                  icon={Car}
                  iconColor={theme.success}
                  label="Available Parking"
                  value={metrics.totalAvailableParking}
                  sublabel={`of ${metrics.totalParkingCapacity} spaces`}
                  badgeText="Open Lots"
                  badgeColor={theme.success}
                  onPress={() => router.push('/(app)/parking')}
                />
                <View style={{ width: spacing.sm }} />
                <MetricCard
                  icon={Users}
                  iconColor={crowdStatus.color}
                  label="Average Crowd"
                  value={`${crowdPercentage}%`}
                  sublabel={crowdStatus.label}
                  badgeText={crowdStatus.level.toUpperCase()}
                  badgeColor={crowdStatus.color}
                  onPress={() => router.push('/(app)/occupancy')}
                />
              </View>
            </View>
          ) : (
            /* Staff / Management 2x2 Metric Cards */
            <View style={styles.metricsGrid}>
              <View style={styles.metricRow}>
                <MetricCard
                  icon={Camera}
                  iconColor={theme.primary}
                  label="CCTV Nodes"
                  value={`${metrics.onlineCameras}/${metrics.totalCameras}`}
                  sublabel={`${metrics.onlineCameras} Nodes Online`}
                  badgeText="Active"
                  badgeColor={theme.primary}
                  onPress={() => router.push('/(app)/cameras')}
                />
                <View style={{ width: spacing.sm }} />
                <MetricCard
                  icon={AlertTriangle}
                  iconColor={metrics.openIncidentsCount > 0 ? theme.error : theme.success}
                  label="Open Incidents"
                  value={metrics.openIncidentsCount}
                  sublabel={
                    metrics.criticalIncidentsCount > 0
                      ? `${metrics.criticalIncidentsCount} Critical`
                      : 'No critical alerts'
                  }
                  badgeText={metrics.openIncidentsCount > 0 ? 'Active' : 'Clear'}
                  badgeColor={metrics.openIncidentsCount > 0 ? theme.error : theme.success}
                  onPress={() => router.push('/(app)/incidents')}
                />
              </View>

              <View style={[styles.metricRow, { marginTop: spacing.sm }]}>
                <MetricCard
                  icon={Car}
                  iconColor={theme.success}
                  label="Parking Free"
                  value={metrics.totalAvailableParking}
                  sublabel={`of ${metrics.totalParkingCapacity} total`}
                  badgeText="Available"
                  badgeColor={theme.success}
                  onPress={() => router.push('/(app)/parking')}
                />
                <View style={{ width: spacing.sm }} />
                <MetricCard
                  icon={Users}
                  iconColor={crowdStatus.color}
                  label="Crowd Density"
                  value={`${crowdPercentage}%`}
                  sublabel={crowdStatus.label}
                  badgeText={crowdStatus.level.toUpperCase()}
                  badgeColor={crowdStatus.color}
                  onPress={() => router.push('/(app)/occupancy')}
                />
              </View>
            </View>
          )}

          {/* Staff Recent Incidents Section */}
          {isStaff && recentIncidents.length > 0 && (
            <View style={styles.incidentsSection}>
              <View style={styles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 0 }]}>
                  Recent Safety Incidents
                </Text>
                <TouchableOpacity
                  onPress={() => router.push('/(app)/incidents')}
                  style={styles.viewAllButton}
                >
                  <Text style={[styles.viewAllText, { color: theme.primary }]}>View All</Text>
                  <ArrowRight color={theme.primary} size={14} style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              </View>

              {recentIncidents.map((inc) => (
                <TouchableOpacity
                  key={inc._id || inc.id || inc.incidentId}
                  style={[
                    styles.incidentSummaryCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                  onPress={() => router.push(`/(app)/incidents/${inc._id || inc.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={styles.incidentRowTop}>
                    <Text style={[styles.incidentType, { color: theme.textPrimary }]}>
                      {formatIncidentEventType(inc.eventType)}
                    </Text>
                    <StatusBadge
                      label={inc.severity}
                      color={getSeverityColor(inc.severity)}
                      textColor="#FFFFFF"
                    />
                  </View>

                  <Text
                    style={[styles.incidentDesc, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {inc.description}
                  </Text>

                  <View style={styles.incidentRowBottom}>
                    <Text style={[styles.incidentTime, { color: theme.textMuted }]}>
                      {formatTimestamp(inc.createdAt)}
                    </Text>
                    <StatusBadge
                      label={inc.status}
                      color={getStatusColor(inc.status)}
                      textColor="#FFFFFF"
                    />
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Student Campus Safety Notice */}
          {isStudent && (
            <View
              style={[
                styles.studentNoticeCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.noticeHeader}>
                <CheckCircle color={theme.success} size={20} style={{ marginRight: 8 }} />
                <Text style={[styles.noticeTitle, { color: theme.textPrimary }]}>
                  Campus Safety & Security Active
                </Text>
              </View>
              <Text style={[styles.noticeBody, { color: theme.textSecondary }]}>
                Campus operations and edge safety detectors are actively monitoring university common areas. In case of emergency, contact Campus Security at extension 5555.
              </Text>
            </View>
          )}

          {/* Quick Module Navigation Section */}
          <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: spacing.md }]}>
            Module Navigation
          </Text>

          <View style={styles.quickNavList}>
            {/* Parking */}
            <TouchableOpacity
              style={[
                styles.navCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
              onPress={() => router.push('/(app)/parking')}
              activeOpacity={0.7}
            >
              <View style={[styles.navIconWrapper, { backgroundColor: theme.surfaceSecondary }]}>
                <Car color={theme.primary} size={22} />
              </View>
              <View style={styles.navTextContainer}>
                <Text style={[styles.navCardTitle, { color: theme.textPrimary }]}>
                  Parking Structures
                </Text>
                <Text style={[styles.navCardSub, { color: theme.textSecondary }]}>
                  {metrics.totalAvailableParking} spaces available campus-wide
                </Text>
              </View>
              <ArrowRight color={theme.textMuted} size={18} />
            </TouchableOpacity>

            {/* Occupancy */}
            <TouchableOpacity
              style={[
                styles.navCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
              onPress={() => router.push('/(app)/occupancy')}
              activeOpacity={0.7}
            >
              <View style={[styles.navIconWrapper, { backgroundColor: theme.surfaceSecondary }]}>
                <Users color={crowdStatus.color} size={22} />
              </View>
              <View style={styles.navTextContainer}>
                <Text style={[styles.navCardTitle, { color: theme.textPrimary }]}>
                  Campus Crowd Density
                </Text>
                <Text style={[styles.navCardSub, { color: theme.textSecondary }]}>
                  {occupancyList.length} monitored study & dining zones
                </Text>
              </View>
              <ArrowRight color={theme.textMuted} size={18} />
            </TouchableOpacity>

            {/* Incidents (Staff Only) */}
            {isStaff && (
              <TouchableOpacity
                style={[
                  styles.navCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                onPress={() => router.push('/(app)/incidents')}
                activeOpacity={0.7}
              >
                <View style={[styles.navIconWrapper, { backgroundColor: theme.surfaceSecondary }]}>
                  <AlertTriangle color={theme.error} size={22} />
                </View>
                <View style={styles.navTextContainer}>
                  <Text style={[styles.navCardTitle, { color: theme.textPrimary }]}>
                    Incident Management
                  </Text>
                  <Text style={[styles.navCardSub, { color: theme.textSecondary }]}>
                    {metrics.openIncidentsCount} active safety candidates & alerts
                  </Text>
                </View>
                <ArrowRight color={theme.textMuted} size={18} />
              </TouchableOpacity>
            )}

            {/* Cameras (Staff Only) */}
            {isStaff && (
              <TouchableOpacity
                style={[
                  styles.navCard,
                  { backgroundColor: theme.surface, borderColor: theme.border },
                ]}
                onPress={() => router.push('/(app)/cameras')}
                activeOpacity={0.7}
              >
                <View style={[styles.navIconWrapper, { backgroundColor: theme.surfaceSecondary }]}>
                  <Camera color={theme.info} size={22} />
                </View>
                <View style={styles.navTextContainer}>
                  <Text style={[styles.navCardTitle, { color: theme.textPrimary }]}>
                    CCTV Camera Nodes
                  </Text>
                  <Text style={[styles.navCardSub, { color: theme.textSecondary }]}>
                    {metrics.onlineCameras} of {metrics.totalCameras} edge streams online
                  </Text>
                </View>
                <ArrowRight color={theme.textMuted} size={18} />
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      )}

      {/* In-App Notifications Modal */}
      <Modal
        visible={showNotificationsModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNotificationsModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalSheet,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
              <View style={styles.modalHeaderTitleRow}>
                <Bell color={theme.primary} size={20} style={{ marginRight: 8 }} />
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  Campus Notifications
                </Text>
              </View>

              <View style={styles.modalHeaderActions}>
                {unreadCount > 0 && (
                  <TouchableOpacity
                    style={[styles.markReadBtn, { backgroundColor: theme.primary + '15' }]}
                    onPress={handleMarkAllNotificationsRead}
                  >
                    <CheckCheck color={theme.primary} size={14} style={{ marginRight: 4 }} />
                    <Text style={[styles.markReadText, { color: theme.primary }]}>
                      Mark Read
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.modalCloseBtn, { borderColor: theme.border }]}
                  onPress={() => setShowNotificationsModal(false)}
                >
                  <X color={theme.textPrimary} size={18} />
                </TouchableOpacity>
              </View>
            </View>

            {notifications.length === 0 ? (
              <View style={styles.modalEmptyContainer}>
                <Bell color={theme.textMuted} size={40} style={{ marginBottom: 12 }} />
                <Text style={[styles.modalEmptyTitle, { color: theme.textPrimary }]}>
                  No Notifications
                </Text>
                <Text style={[styles.modalEmptyText, { color: theme.textSecondary }]}>
                  You have no pending campus alerts or updates.
                </Text>
              </View>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(item) => String(item._id || item.id)}
                contentContainerStyle={styles.notificationsList}
                renderItem={({ item }) => {
                  const isUnread = !item.readAt;
                  return (
                    <TouchableOpacity
                      style={[
                        styles.notificationCard,
                        {
                          backgroundColor: isUnread
                            ? theme.isDark ? '#1F2937' : '#F0F9FF'
                            : theme.background,
                          borderColor: isUnread ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => handleNotificationPress(item)}
                    >
                      <View style={styles.notificationHeaderRow}>
                        <View style={styles.notificationTitleRow}>
                          {isUnread && <View style={[styles.unreadDot, { backgroundColor: theme.primary }]} />}
                          <Text
                            style={[
                              styles.notificationItemTitle,
                              { color: theme.textPrimary, fontWeight: isUnread ? '700' : '500' },
                            ]}
                            numberOfLines={1}
                          >
                            {item.title}
                          </Text>
                        </View>
                        <Text style={[styles.notificationTime, { color: theme.textSecondary }]}>
                          {formatTimestamp(item.createdAt)}
                        </Text>
                      </View>
                      <Text style={[styles.notificationMessage, { color: theme.textSecondary }]} numberOfLines={2}>
                        {item.message}
                      </Text>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  userSection: {
    flex: 1,
    marginRight: spacing.sm,
  },
  greetingSub: {
    fontSize: typography.tiny,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  greetingName: {
    fontSize: typography.heading,
    fontWeight: '800',
    marginTop: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.full,
    marginRight: spacing.sm,
  },
  rolePillText: {
    color: '#FFFFFF',
    fontSize: typography.tiny,
    fontWeight: '700',
  },
  iconButton: {
    borderWidth: 1,
    padding: 6,
    borderRadius: radius.md,
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
  welcomeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
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
  bannerIconBox: {
    marginRight: spacing.md,
  },
  bannerTextBox: {
    flex: 1,
  },
  bannerTitle: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: 2,
  },
  bannerDescription: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewAllText: {
    fontSize: typography.caption,
    fontWeight: '700',
  },
  metricsGrid: {
    marginBottom: spacing.md,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  incidentsSection: {
    marginBottom: spacing.md,
  },
  incidentSummaryCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
  },
  incidentRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  incidentType: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  incidentDesc: {
    fontSize: typography.caption,
    marginBottom: 6,
  },
  incidentRowBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  incidentTime: {
    fontSize: typography.tiny,
  },
  studentNoticeCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  noticeTitle: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  noticeBody: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
  quickNavList: {
    gap: spacing.sm,
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  navIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  navTextContainer: {
    flex: 1,
  },
  navCardTitle: {
    fontSize: typography.body,
    fontWeight: '700',
    marginBottom: 2,
  },
  navCardSub: {
    fontSize: typography.caption,
  },
  unreadBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    maxHeight: '80%',
    minHeight: 350,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: typography.heading,
    fontWeight: '700',
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.full,
    marginRight: 6,
  },
  markReadText: {
    fontSize: typography.tiny,
    fontWeight: '700',
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  modalEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  modalEmptyTitle: {
    fontSize: typography.body,
    fontWeight: '700',
    marginBottom: 4,
  },
  modalEmptyText: {
    fontSize: typography.caption,
    textAlign: 'center',
  },
  notificationsList: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  notificationCard: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  notificationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  notificationTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  unreadDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  notificationItemTitle: {
    fontSize: typography.body,
  },
  notificationTime: {
    fontSize: typography.tiny,
    marginLeft: spacing.xs,
  },
  notificationMessage: {
    fontSize: typography.caption,
    lineHeight: 18,
  },
});
