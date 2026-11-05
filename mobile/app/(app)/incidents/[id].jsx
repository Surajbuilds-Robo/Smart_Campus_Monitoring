import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AlertTriangle,
  Camera,
  Clock,
  CheckCircle,
  XCircle,
  Search,
  Shield,
  FileText,
  Info,
} from 'lucide-react-native';

import HeaderBar from '../../../components/HeaderBar.jsx';
import StatusBadge from '../../../components/StatusBadge.jsx';
import ErrorState from '../../../components/ErrorState.jsx';
import { useThemeColors, spacing, radius, typography } from '../../../constants/theme.js';
import { incidentApi } from '../../../services/campusService.js';
import {
  formatIncidentEventType,
  getSeverityColor,
  getStatusColor,
  getPermittedTransitions,
  formatTimestamp,
} from '../../../utils/calculations.js';
import { getApiErrorMessage } from '../../../services/apiClient.js';
import { useAuth } from '../../../hooks/useAuth.js';
import { useSocket } from '../../../hooks/useSocket.js';
import { useSocketEvent } from '../../../hooks/useSocketEvent.js';
import { validateIncidentUpdatedPayload } from '../../../utils/eventValidators.js';

export default function IncidentDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const theme = useThemeColors();
  const { isStaff } = useAuth();
  const { reconnectCount } = useSocket();

  const [incident, setIncident] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  // Guard: Staff only
  useEffect(() => {
    if (!isStaff) {
      router.replace('/(app)/unauthorized');
    }
  }, [isStaff, router]);

  const fetchDetail = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const data = await incidentApi.getById(id);
      setIncident(data);
    } catch (err) {
      setErrorMessage(getApiErrorMessage(err, 'Failed to retrieve incident details.'));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isStaff) {
      fetchDetail();
    }
  }, [isStaff, fetchDetail]);

  // Resynchronize authoritative details on reconnection
  useEffect(() => {
    if (isStaff && reconnectCount > 0) {
      fetchDetail();
    }
  }, [isStaff, reconnectCount, fetchDetail]);

  // Handle live status updates for this specific incident
  useSocketEvent('incident:updated', (payload) => {
    if (!isStaff || !id) return;
    const valid = validateIncidentUpdatedPayload(payload);
    if (!valid) return;

    const targetId = String(valid.id || valid.incidentId);
    const currentId = String(id);
    const incidentObjId = incident ? String(incident._id || incident.id || incident.incidentId) : '';

    if (targetId === currentId || targetId === incidentObjId) {
      setIncident((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          status: valid.status || prev.status,
          assignedTo: valid.assignedTo !== undefined ? valid.assignedTo : prev.assignedTo,
          updatedAt: valid.updatedAt || prev.updatedAt,
        };
      });
    }
  });

  const handleStatusChange = (newStatus) => {
    if (isUpdating) return;

    const actionNames = {
      acknowledged: 'Acknowledge',
      investigating: 'Begin Investigation on',
      resolved: 'Resolve',
      dismissed: 'Dismiss',
    };
    const actionWord = actionNames[newStatus] || newStatus;

    Alert.alert(
      'Confirm Status Transition',
      `Are you sure you want to transition this incident to "${newStatus}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionWord,
          style: newStatus === 'dismissed' ? 'destructive' : 'default',
          onPress: async () => {
            setIsUpdating(true);
            try {
              const updated = await incidentApi.updateStatus(id, newStatus);
              if (updated) {
                setIncident(updated);
              } else {
                await fetchDetail();
              }
              Alert.alert('Status Updated', `Incident status transitioned to ${newStatus}.`);
            } catch (err) {
              const msg = getApiErrorMessage(err, 'Failed to update incident status.');
              Alert.alert('Update Failed', msg);
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  if (!isStaff) return null;

  const severityColor = getSeverityColor(incident?.severity);
  const statusColor = getStatusColor(incident?.status);
  const allowedTransitions = getPermittedTransitions(incident?.status);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <HeaderBar
        title={incident ? incident.incidentId : 'Incident Detail'}
        subtitle="Campus Safety Operations"
      />

      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading incident data...
          </Text>
        </View>
      ) : errorMessage || !incident ? (
        <ErrorState
          title="Incident Not Found"
          message={errorMessage || 'The requested incident could not be found.'}
          onRetry={fetchDetail}
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Main Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <View style={styles.idContainer}>
                <Text style={[styles.incidentId, { color: theme.primary }]}>
                  {incident.incidentId}
                </Text>
                <Text style={[styles.eventType, { color: theme.textPrimary }]}>
                  {formatIncidentEventType(incident.eventType)}
                </Text>
              </View>

              <View style={styles.badgeRow}>
                <StatusBadge
                  label={incident.severity}
                  color={severityColor}
                  textColor="#FFFFFF"
                  style={{ marginRight: 6 }}
                />
                <StatusBadge
                  label={incident.status}
                  color={statusColor}
                  textColor="#FFFFFF"
                />
              </View>
            </View>

            {/* Description */}
            <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
              Description
            </Text>
            <Text style={[styles.descriptionText, { color: theme.textPrimary }]}>
              {incident.description}
            </Text>

            {/* AI Confidence */}
            {incident.confidence !== null && incident.confidence !== undefined && (
              <View style={[styles.confidenceBox, { backgroundColor: theme.surfaceSecondary }]}>
                <Shield color={theme.primary} size={16} style={{ marginRight: 6 }} />
                <Text style={[styles.confidenceText, { color: theme.textSecondary }]}>
                  AI Edge Confidence Score: <Text style={{ fontWeight: '700', color: theme.textPrimary }}>{(incident.confidence * 100).toFixed(0)}%</Text>
                </Text>
              </View>
            )}
          </View>

          {/* Camera & Location Card */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <Camera color={theme.primary} size={18} />
              <Text style={[styles.cardSectionTitle, { color: theme.textPrimary }]}>
                Detection Source & Location
              </Text>
            </View>

            <View style={styles.specRow}>
              <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Camera Name</Text>
              <Text style={[styles.specValue, { color: theme.textPrimary }]}>
                {incident.camera?.name || incident.camera?.cameraId || 'Campus Surveillance'}
              </Text>
            </View>

            <View style={styles.specRow}>
              <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Location</Text>
              <Text style={[styles.specValue, { color: theme.textPrimary }]}>
                {incident.camera?.location || 'Campus Perimeter'}
              </Text>
            </View>

            {incident.camera?.building && (
              <View style={styles.specRow}>
                <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Building</Text>
                <Text style={[styles.specValue, { color: theme.textPrimary }]}>
                  {incident.camera.building}
                </Text>
              </View>
            )}

            <View style={[styles.specRow, styles.specRowLast]}>
              <Text style={[styles.specLabel, { color: theme.textSecondary }]}>Occurred At</Text>
              <Text style={[styles.specValue, { color: theme.textPrimary }]}>
                {formatTimestamp(incident.createdAt)}
              </Text>
            </View>
          </View>

          {/* Evidence Card */}
          {Array.isArray(incident.evidence) && incident.evidence.length > 0 && (
            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                },
              ]}
            >
              <View style={styles.sectionHeaderRow}>
                <FileText color={theme.info} size={18} />
                <Text style={[styles.cardSectionTitle, { color: theme.textPrimary }]}>
                  Secured Evidence Records ({incident.evidence.length})
                </Text>
              </View>

              <Text style={[styles.evidenceNote, { color: theme.textSecondary }]}>
                Raw capture evidence is encrypted and restricted to staff roles with automatic 30-day retention policies:
              </Text>

              {incident.evidence.map((ev, index) => (
                <View
                  key={ev._id || ev.storageKey || index}
                  style={[styles.evidenceItem, { backgroundColor: theme.surfaceSecondary }]}
                >
                  <Text style={[styles.evidenceKey, { color: theme.textPrimary }]} numberOfLines={1}>
                    {ev.storageKey}
                  </Text>
                  <Text style={[styles.evidenceDate, { color: theme.textMuted }]}>
                    Captured: {formatTimestamp(ev.capturedAt)} • Retained until {formatTimestamp(ev.expiresAt)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Authorized Actions / State Transitions */}
          <View
            style={[
              styles.card,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
              },
            ]}
          >
            <View style={styles.sectionHeaderRow}>
              <CheckCircle color={theme.primary} size={18} />
              <Text style={[styles.cardSectionTitle, { color: theme.textPrimary }]}>
                Workflow Actions
              </Text>
            </View>

            {allowedTransitions.length === 0 ? (
              <View style={[styles.terminalBanner, { backgroundColor: theme.surfaceSecondary }]}>
                <Info color={theme.textMuted} size={18} style={{ marginRight: 8 }} />
                <Text style={[styles.terminalText, { color: theme.textSecondary }]}>
                  This incident is in terminal state ({incident.status}). No further state transitions are allowed.
                </Text>
              </View>
            ) : (
              <View style={styles.actionsContainer}>
                <Text style={[styles.actionsInstruction, { color: theme.textSecondary }]}>
                  Permitted state machine transitions from <Text style={{ fontWeight: '700' }}>{incident.status}</Text>:
                </Text>

                {allowedTransitions.includes('acknowledged') && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#2563EB' }]}
                    onPress={() => handleStatusChange('acknowledged')}
                    disabled={isUpdating}
                  >
                    <CheckCircle color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.actionButtonText}>Acknowledge Incident</Text>
                  </TouchableOpacity>
                )}

                {allowedTransitions.includes('investigating') && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#7C3AED' }]}
                    onPress={() => handleStatusChange('investigating')}
                    disabled={isUpdating}
                  >
                    <Search color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.actionButtonText}>Begin Active Investigation</Text>
                  </TouchableOpacity>
                )}

                {allowedTransitions.includes('resolved') && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#059669' }]}
                    onPress={() => handleStatusChange('resolved')}
                    disabled={isUpdating}
                  >
                    <CheckCircle color="#FFFFFF" size={18} style={{ marginRight: 8 }} />
                    <Text style={styles.actionButtonText}>Mark Incident as Resolved</Text>
                  </TouchableOpacity>
                )}

                {allowedTransitions.includes('dismissed') && (
                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      { backgroundColor: theme.surfaceSecondary, borderWidth: 1, borderColor: theme.border },
                    ]}
                    onPress={() => handleStatusChange('dismissed')}
                    disabled={isUpdating}
                  >
                    <XCircle color={theme.error} size={18} style={{ marginRight: 8 }} />
                    <Text style={[styles.actionButtonText, { color: theme.error }]}>Dismiss Incident</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {isUpdating && (
              <View style={styles.updatingOverlay}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={[styles.updatingText, { color: theme.primary }]}>
                  Updating status on campus server...
                </Text>
              </View>
            )}
          </View>
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
  card: {
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
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  idContainer: {
    flex: 1,
    marginRight: spacing.sm,
  },
  incidentId: {
    fontSize: typography.caption,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginBottom: 2,
  },
  eventType: {
    fontSize: typography.heading,
    fontWeight: '700',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: typography.caption,
    fontWeight: '600',
    marginBottom: 4,
  },
  descriptionText: {
    fontSize: typography.body,
    lineHeight: 22,
    marginBottom: spacing.sm,
  },
  confidenceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  confidenceText: {
    fontSize: typography.caption,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardSectionTitle: {
    fontSize: typography.heading,
    fontWeight: '700',
    marginLeft: spacing.sm,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  specRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 2,
  },
  specLabel: {
    fontSize: typography.body,
  },
  specValue: {
    fontSize: typography.body,
    fontWeight: '600',
  },
  evidenceNote: {
    fontSize: typography.caption,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  evidenceItem: {
    padding: spacing.sm,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
  },
  evidenceKey: {
    fontSize: typography.caption,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  evidenceDate: {
    fontSize: typography.tiny,
    marginTop: 2,
  },
  terminalBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.xs,
  },
  terminalText: {
    fontSize: typography.body,
    flex: 1,
    lineHeight: 18,
  },
  actionsContainer: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  actionsInstruction: {
    fontSize: typography.caption,
    marginBottom: 4,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    minHeight: 46,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: typography.body,
  },
  updatingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  updatingText: {
    marginLeft: spacing.sm,
    fontSize: typography.caption,
    fontWeight: '600',
  },
});
