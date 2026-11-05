import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  AlertTriangle,
  Camera,
  Clock,
  ArrowRight,
  Filter,
  CheckCircle2,
} from 'lucide-react-native';

import HeaderBar from '../../../components/HeaderBar.jsx';
import StatusBadge from '../../../components/StatusBadge.jsx';
import EmptyState from '../../../components/EmptyState.jsx';
import ErrorState from '../../../components/ErrorState.jsx';
import { useThemeColors, spacing, radius, typography } from '../../../constants/theme.js';
import { incidentApi } from '../../../services/campusService.js';
import {
  formatIncidentEventType,
  getSeverityColor,
  getStatusColor,
  formatTimestamp,
} from '../../../utils/calculations.js';
import { getApiErrorMessage } from '../../../services/apiClient.js';
import { useAuth } from '../../../hooks/useAuth.js';
import { useSocket } from '../../../hooks/useSocket.js';
import { useSocketEvent } from '../../../hooks/useSocketEvent.js';
import {
  validateIncidentCreatedPayload,
  validateIncidentUpdatedPayload,
} from '../../../utils/eventValidators.js';

const STATUS_FILTERS = [
  { key: 'all', label: 'All Incidents' },
  { key: 'new', label: 'New' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'investigating', label: 'Investigating' },
  { key: 'resolved', label: 'Resolved' },
];

export default function IncidentsListScreen() {
  const router = useRouter();
  const theme = useThemeColors();
  const { isStaff } = useAuth();
  const { reconnectCount } = useSocket();

  const [incidents, setIncidents] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // If student attempts to view incidents, guard immediately
  useEffect(() => {
    if (!isStaff) {
      router.replace('/(app)/unauthorized');
    }
  }, [isStaff, router]);

  const fetchIncidents = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const data = await incidentApi.list();
      setIncidents(Array.isArray(data) ? data : []);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to retrieve campus incidents.'));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isStaff) {
      fetchIncidents();
    }
  }, [isStaff, fetchIncidents]);

  // Resynchronize incidents upon reconnection
  useEffect(() => {
    if (isStaff && reconnectCount > 0) {
      fetchIncidents(true);
    }
  }, [isStaff, reconnectCount, fetchIncidents]);

  // Handle incoming new incident creation
  useSocketEvent('incident:created', (payload) => {
    if (!isStaff) return;
    const valid = validateIncidentCreatedPayload(payload);
    if (!valid) return;

    setIncidents((prevIncidents) => {
      const targetId = String(valid.id || valid.incidentId);
      const exists = prevIncidents.some(
        (i) => String(i.id || i._id || i.incidentId) === targetId
      );

      if (exists) {
        return prevIncidents;
      }

      return [valid, ...prevIncidents];
    });
  });

  // Handle incident status and assignment updates
  useSocketEvent('incident:updated', (payload) => {
    if (!isStaff) return;
    const valid = validateIncidentUpdatedPayload(payload);
    if (!valid) return;

    setIncidents((prevIncidents) => {
      const targetId = String(valid.id || valid.incidentId);
      return prevIncidents.map((incident) => {
        if (String(incident.id || incident._id || incident.incidentId) === targetId) {
          // Guard against stale out-of-order events
          if (
            incident.updatedAt &&
            valid.updatedAt &&
            new Date(valid.updatedAt).getTime() < new Date(incident.updatedAt).getTime()
          ) {
            return incident;
          }

          return {
            ...incident,
            status: valid.status || incident.status,
            assignedTo: valid.assignedTo !== undefined ? valid.assignedTo : incident.assignedTo,
            updatedAt: valid.updatedAt || incident.updatedAt,
          };
        }
        return incident;
      });
    });
  });

  // Filtered incidents
  const filteredIncidents = incidents.filter((item) => {
    if (selectedStatus === 'all') return true;
    return item.status === selectedStatus;
  });

  const activeCount = incidents.filter((i) =>
    ['new', 'acknowledged', 'investigating'].includes(i.status)
  ).length;

  if (!isStaff) {
    return null;
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <HeaderBar
        title="Incident Management"
        subtitle={`${activeCount} active safety & security alerts`}
      />

      {/* Filter Tabs */}
      <View style={[styles.filterBar, { borderBottomColor: theme.border }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScroll}
        >
          {STATUS_FILTERS.map((tab) => {
            const isSelected = selectedStatus === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: isSelected ? theme.primary : theme.surfaceSecondary,
                    borderColor: isSelected ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => setSelectedStatus(tab.key)}
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: isSelected ? '#FFFFFF' : theme.textSecondary },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Retrieving campus incidents...
          </Text>
        </View>
      ) : errorMessage ? (
        <ErrorState
          title="Incident Feed Unavailable"
          message={errorMessage}
          onRetry={() => fetchIncidents(false)}
        />
      ) : filteredIncidents.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="No Matching Incidents"
          message={
            selectedStatus === 'all'
              ? 'No safety incidents have been recorded on campus.'
              : `There are currently no incidents with status "${selectedStatus}".`
          }
          onRetry={() => fetchIncidents(true)}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchIncidents(true)}
              tintColor={theme.primary}
            />
          }
        >
          {filteredIncidents.map((incident) => {
            const id = incident._id || incident.id;
            const severityColor = getSeverityColor(incident.severity);
            const statusColor = getStatusColor(incident.status);

            return (
              <TouchableOpacity
                key={id || incident.incidentId}
                style={[
                  styles.incidentCard,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => router.push(`/(app)/incidents/${id}`)}
                accessibilityRole="button"
                activeOpacity={0.7}
              >
                {/* Header: ID, Event Type, Severity */}
                <View style={styles.cardHeader}>
                  <View style={styles.titleArea}>
                    <Text style={[styles.incidentId, { color: theme.primary }]}>
                      {incident.incidentId}
                    </Text>
                    <Text style={[styles.eventType, { color: theme.textPrimary }]} numberOfLines={1}>
                      {formatIncidentEventType(incident.eventType)}
                    </Text>
                  </View>

                  <View style={styles.badgeGroup}>
                    <StatusBadge
                      label={incident.severity}
                      color={severityColor}
                      textColor="#FFFFFF"
                      style={{ marginRight: 4 }}
                    />
                    <StatusBadge
                      label={incident.status}
                      color={statusColor}
                      textColor="#FFFFFF"
                    />
                  </View>
                </View>

                {/* Description */}
                <Text
                  style={[styles.description, { color: theme.textSecondary }]}
                  numberOfLines={2}
                >
                  {incident.description}
                </Text>

                {/* Footer: Camera Location & Timestamp */}
                <View style={styles.cardFooter}>
                  <View style={styles.metaRow}>
                    <Camera color={theme.textMuted} size={13} style={{ marginRight: 4 }} />
                    <Text style={[styles.metaText, { color: theme.textMuted }]} numberOfLines={1}>
                      {incident.camera?.name || incident.camera?.cameraId || 'Camera CCTV'}
                    </Text>
                  </View>

                  <View style={styles.metaRow}>
                    <Clock color={theme.textMuted} size={13} style={{ marginRight: 4 }} />
                    <Text style={[styles.metaText, { color: theme.textMuted }]}>
                      {formatTimestamp(incident.createdAt)}
                    </Text>
                    <ArrowRight color={theme.textMuted} size={14} style={{ marginLeft: 6 }} />
                  </View>
                </View>
              </TouchableOpacity>
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
  filterBar: {
    borderBottomWidth: 1,
    paddingVertical: spacing.sm,
  },
  filterScroll: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: typography.caption,
    fontWeight: '600',
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
  incidentCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  titleArea: {
    flex: 1,
    marginRight: spacing.sm,
  },
  incidentId: {
    fontSize: typography.tiny,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  eventType: {
    fontSize: typography.body,
    fontWeight: '700',
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  description: {
    fontSize: typography.body,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(150, 150, 150, 0.15)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: typography.caption,
  },
});
