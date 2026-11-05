import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Search,
  RefreshCw,
  CheckCircle2,
  X,
  Users,
  Mail,
  Send,
  MapPin,
  Clock,
  Building,
} from "lucide-react";
import { incidentApi } from "../services/campusApi";
import { getApiErrorMessage } from "../services/apiClient";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import useSocketEvent from "../hooks/useSocketEvent";
import useOnClickFetch from "../hooks/useOnClickFetch";
import constants from "../../../shared/constants.json";
import {
  IncidentSeverityBadge,
  IncidentStatusBadge,
  EvidenceViewer,
} from "../features/incidents";
import {
  Button,
  Card,
  CardContent,
  PageHeader,
  Skeleton,
  EmptyState,
  ErrorState,
} from "../components/ui";

const { transitions } = constants.incident;

export default function Incidents() {
  const { user } = useAuth();
  const { connected } = useSocket();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlIncidentId = searchParams.get("id");

  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [retryEmailLoading, setRetryEmailLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const wasConnectedRef = useRef(false);

  // On-demand fetch for full incident details when modal opens
  const {
    data: detailData,
    execute: fetchIncidentDetail,
  } = useOnClickFetch(incidentApi.getById);

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await incidentApi.list();
      setIncidents(data || []);
    } catch {
      setError("Failed to fetch security incidents from server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await incidentApi.list();
        if (active) setIncidents(data || []);
      } catch {
        if (active) setError("Failed to fetch security incidents from server.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  // Reconcile missed updates when socket reconnects (Requirement D & E)
  useEffect(() => {
    if (connected && wasConnectedRef.current === false) {
      fetchIncidents();
    }
    wasConnectedRef.current = connected;
  }, [connected, fetchIncidents]);

  // Realtime updates from Socket.IO with contract deduplication
  useSocketEvent("incident:created", (event) => {
    setIncidents((prev) => {
      const eventId = event._id || event.id || event.incidentId;
      const exists = prev.some((i) => (i._id || i.id || i.incidentId) === eventId);
      if (exists) {
        return prev.map((i) =>
          (i._id || i.id || i.incidentId) === eventId ? event : i
        );
      }
      return [event, ...prev];
    });
  });

  useSocketEvent("incident:updated", (event) => {
    const eventId = event._id || event.id || event.incidentId;
    setIncidents((prev) =>
      prev.map((i) =>
        (i._id || i.id || i.incidentId) === eventId ? { ...i, ...event } : i
      )
    );

    if (
      selectedIncident &&
      (selectedIncident._id === eventId ||
        selectedIncident.incidentId === event.incidentId)
    ) {
      setSelectedIncident((prev) => ({ ...prev, ...event }));
    }
  });

  const handleInspect = async (incident) => {
    setSelectedIncident(incident);
    setFeedback(null);
    const targetId = incident._id || incident.id || incident.incidentId;
    if (targetId) {
      try {
        const fullDetail = await fetchIncidentDetail(targetId);
        if (fullDetail) {
          setSelectedIncident(fullDetail);
        }
      } catch {
        // Fallback to existing list record
      }
    }
  };

  useEffect(() => {
    if (!urlIncidentId || loading) return;
    const match = incidents.find(
      (i) => (i._id || i.id || i.incidentId) === urlIncidentId
    );
    if (match) {
      handleInspect(match);
    } else {
      fetchIncidentDetail(urlIncidentId)
        .then((detail) => {
          if (detail) setSelectedIncident(detail);
        })
        .catch(() => {});
    }
  }, [urlIncidentId, incidents, loading]);

  const handleRetryEmail = async () => {
    if (!selectedIncident) return;
    const id = selectedIncident._id || selectedIncident.id || selectedIncident.incidentId;

    setRetryEmailLoading(true);
    setFeedback(null);

    try {
      const res = await incidentApi.retryEmail(id);
      if (res?.incident) {
        setSelectedIncident(res.incident);
        setIncidents((prev) =>
          prev.map((i) =>
            (i._id || i.id || i.incidentId) === id ? res.incident : i
          )
        );
      }
      setFeedback({
        type: res?.emailStatus === "sent" ? "success" : "error",
        message:
          res?.emailStatus === "sent"
            ? "Crowd alert email successfully dispatched to Super Admin & Department Head."
            : `Email dispatch result: ${res?.emailStatus || "failed"}. ${res?.emailError || ""}`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: getApiErrorMessage(err, "Failed to retry email delivery."),
      });
    } finally {
      setRetryEmailLoading(false);
    }
  };

  const handleStatusTransition = async (newStatus) => {
    if (!selectedIncident) return;
    const id = selectedIncident._id || selectedIncident.id || selectedIncident.incidentId;

    setActionLoading(true);
    setFeedback(null);

    try {
      const updated = await incidentApi.updateStatus(id, newStatus);
      const safeUpdated = updated || { ...selectedIncident, status: newStatus };
      setSelectedIncident(safeUpdated);
      setIncidents((prev) =>
        prev.map((i) =>
          (i._id || i.id || i.incidentId) === id ? safeUpdated : i
        )
      );
      setFeedback({
        type: "success",
        message: `Incident status updated to "${newStatus}".`,
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: getApiErrorMessage(err, "Failed to update incident status."),
      });
    } finally {
      setActionLoading(false);
    }
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter((incident) => {
      const matchesSearch =
        search === "" ||
        incident.incidentId?.toLowerCase().includes(search.toLowerCase()) ||
        incident.eventType?.toLowerCase().includes(search.toLowerCase()) ||
        incident.description?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || incident.status === statusFilter;

      const matchesSeverity =
        severityFilter === "all" || incident.severity === severityFilter;

      return matchesSearch && matchesStatus && matchesSeverity;
    });
  }, [incidents, search, statusFilter, severityFilter]);

  const activeIncident = detailData || selectedIncident;

  const allowedNextStatuses = useMemo(() => {
    if (!activeIncident?.status) return [];
    return transitions[activeIncident.status] || [];
  }, [activeIncident]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Incident Management"
        description="Review AI-detected safety events, evidence snapshots, and authorized resolution workflows"
        icon={AlertTriangle}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchIncidents}
          loading={loading}
          icon={RefreshCw}
        >
          Refresh Incidents
        </Button>
      </PageHeader>

      {error && (
        <ErrorState
          title="Incident records unavailable"
          description={error}
          onRetry={fetchIncidents}
        />
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            placeholder="Search by ID, type, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="Filter by status"
            className="rounded-xl border border-[#E5D6D6] bg-white px-3 py-2 text-xs font-medium text-[#3C1414] focus:border-[#B26262] focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="new">New</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>

          {/* Severity Filter */}
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            aria-label="Filter by severity"
            className="rounded-xl border border-[#E5D6D6] bg-white px-3 py-2 text-xs font-medium text-[#3C1414] focus:border-[#B26262] focus:outline-none"
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
      </div>

      {/* Incident List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredIncidents.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title={
                  search || statusFilter !== "all" || severityFilter !== "all"
                    ? "No incidents match query"
                    : "No incidents recorded."
                }
                description={
                  search || statusFilter !== "all" || severityFilter !== "all"
                    ? "Try adjusting your search keywords or filter dropdowns."
                    : "No security anomalies have been detected across monitored campus zones."
                }
                icon={CheckCircle2}
              />
            </div>
          ) : (
            <div className="divide-y divide-[#E5D6D6] overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-xs">
                <thead className="bg-[#F6EDED] text-[#806B6A] uppercase tracking-wider">
                  <tr>
                    <th className="py-3.5 pl-6 pr-3 font-semibold">Incident</th>
                    <th className="px-3 py-3.5 font-semibold">Severity</th>
                    <th className="px-3 py-3.5 font-semibold">Status</th>
                    <th className="px-3 py-3.5 font-semibold">Description</th>
                    <th className="px-3 py-3.5 font-semibold">Confidence</th>
                    <th className="px-3 py-3.5 font-semibold">Detected At</th>
                    <th className="py-3.5 pl-3 pr-6 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5D6D6]">
                  {filteredIncidents.map((incident) => (
                    <tr
                      key={incident.incidentId || incident._id}
                      className="transition hover:bg-[#F0E3E3]/40"
                    >
                      <td className="py-4 pl-6 pr-3 font-medium">
                        <div className="font-bold text-[#3C1414]">
                          {incident.eventType?.replace(/_/g, " ").toUpperCase()}
                        </div>
                        <div className="font-mono text-[11px] text-[#806B6A]">
                          #{incident.incidentId}
                        </div>
                      </td>

                      <td className="px-3 py-4">
                        <IncidentSeverityBadge severity={incident.severity} />
                      </td>

                      <td className="px-3 py-4">
                        <IncidentStatusBadge status={incident.status} />
                      </td>

                      <td className="px-3 py-4 max-w-xs truncate text-[#806B6A]">
                        {incident.description}
                      </td>

                      <td className="px-3 py-4 font-mono text-[#3C1414]">
                        {incident.confidence !== null && incident.confidence !== undefined
                          ? `${Math.round(incident.confidence * 100)}%`
                          : "Verified"}
                      </td>

                      <td className="px-3 py-4 text-[#806B6A]">
                        {incident.createdAt
                          ? new Date(incident.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Recent"}
                      </td>

                      <td className="py-4 pl-3 pr-6 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleInspect(incident)}
                          className="min-h-[44px]"
                        >
                          Details
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Incident Details & Workflow Modal */}
      {selectedIncident && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#3C1414]/30 p-3 sm:p-4 backdrop-blur-xs"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedIncident(null);
            }
          }}
        >
          <div className="w-full max-w-2xl max-h-[92dvh] overflow-y-auto rounded-2xl border border-[#E5D6D6] bg-white p-4 sm:p-6 shadow-2xl text-[#3C1414]">
            <div className="flex items-center justify-between border-b border-[#E5D6D6] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFF4CC] text-[#A66A00]">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-[#3C1414]">
                    {activeIncident.eventType?.replace(/_/g, " ").toUpperCase()}
                  </h3>
                  <p className="font-mono text-xs text-[#806B6A]">
                    Incident #{activeIncident.incidentId}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedIncident(null)}
                aria-label="Close modal"
                className="flex h-9 w-9 items-center justify-center rounded-xl text-[#806B6A] hover:bg-[#FDECEC] hover:text-[#C62828]"
              >
                <X size={18} />
              </button>
            </div>

            {feedback && (
              <div
                role="alert"
                className={`mt-4 rounded-xl p-3 text-xs font-medium ${
                  feedback.type === "success"
                    ? "bg-[#E7F5EA] text-[#287A43] border border-[#287A43]/30"
                    : "bg-[#FDECEC] text-[#C62828] border border-[#C62828]/30"
                }`}
              >
                {feedback.message}
              </div>
            )}

            <div className="mt-4 space-y-4 text-xs">
              {/* Badges Strip */}
              <div className="flex flex-wrap items-center gap-2">
                <IncidentSeverityBadge severity={activeIncident.severity} />
                <IncidentStatusBadge status={activeIncident.status} />
                {activeIncident.emailStatus && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      activeIncident.emailStatus === "sent"
                        ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                        : activeIncident.emailStatus === "failed"
                        ? "bg-rose-100 text-rose-800 border border-rose-300"
                        : activeIncident.emailStatus === "not_configured"
                        ? "bg-amber-100 text-amber-800 border border-amber-300"
                        : "bg-blue-100 text-blue-800 border border-blue-300"
                    }`}
                  >
                    <Mail size={12} />
                    Email: {activeIncident.emailStatus.replace(/_/g, " ").toUpperCase()}
                  </span>
                )}
              </div>

              {/* Crowd Alert Metric Card (Requirement 1, 2) */}
              {(activeIncident.eventType === "crowd_gathering" ||
                activeIncident.metadata?.people_count !== undefined ||
                activeIncident.peopleCount !== undefined) && (
                <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 text-[#3C1414]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-red-900 flex items-center gap-1.5">
                      <Users size={16} className="text-red-600" />
                      Crowd Density Metric
                    </span>
                    <span className="rounded-md bg-red-100 px-2 py-0.5 font-mono text-[11px] font-bold text-red-700">
                      Rule: count &gt; threshold
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="rounded-lg bg-white p-2.5 border border-red-100 shadow-xs">
                      <span className="text-[11px] text-slate-500">Detected Count</span>
                      <p className="text-lg font-extrabold text-red-600">
                        {activeIncident.metadata?.people_count ?? activeIncident.peopleCount ?? "—"} People
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2.5 border border-red-100 shadow-xs">
                      <span className="text-[11px] text-slate-500">Configured Threshold</span>
                      <p className="text-lg font-bold text-slate-700">
                        &gt; {activeIncident.metadata?.threshold ?? activeIncident.threshold ?? 4}
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1 rounded-lg bg-white p-2.5 border border-red-100 shadow-xs">
                      <span className="text-[11px] text-slate-500">Trigger Status</span>
                      <p className="text-xs font-semibold text-emerald-700 mt-1">
                        Active Qualifying Event
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Description Box */}
              <div className="rounded-xl bg-[#F6EDED] p-4 text-[#3C1414]">
                <p className="font-semibold text-[#3C1414]">
                  Detection Summary
                </p>
                <p className="mt-1 text-[#806B6A]">
                  {activeIncident.description}
                </p>
              </div>

              {/* Telemetry and Location Details (Requirement 2) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] p-3">
                  <span className="text-[#806B6A] flex items-center gap-1">
                    <Building size={13} /> Camera & ID
                  </span>
                  <p className="mt-0.5 font-medium text-[#3C1414]">
                    {activeIncident.camera?.name || "Campus Camera"}
                  </p>
                  <p className="font-mono text-[11px] text-[#806B6A]">
                    ID: {activeIncident.camera?.cameraId || (typeof activeIncident.camera === "string" ? activeIncident.camera : "CAM-01")}
                  </p>
                </div>

                <div className="rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] p-3">
                  <span className="text-[#806B6A] flex items-center gap-1">
                    <MapPin size={13} /> Location / Building
                  </span>
                  <p className="mt-0.5 font-medium text-[#3C1414]">
                    {activeIncident.camera?.location?.building ||
                      activeIncident.metadata?.building ||
                      activeIncident.location?.building ||
                      "Main Campus Complex"}
                  </p>
                  <p className="text-[11px] text-[#806B6A]">
                    {activeIncident.camera?.location?.floor || activeIncident.metadata?.floor || "Floor 1"}
                    {activeIncident.camera?.location?.roomName ? ` • ${activeIncident.camera.location.roomName}` : ""}
                  </p>
                </div>
              </div>

              {/* Timestamps in Asia/Kolkata (Requirement 2, 9) */}
              <div className="rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] p-3 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#806B6A] flex items-center gap-1">
                    <Clock size={13} /> Incident Date & Time (Asia/Kolkata):
                  </span>
                  <span className="font-medium text-[#3C1414]">
                    {activeIncident.capturedAt || activeIncident.createdAt
                      ? new Date(activeIncident.capturedAt || activeIncident.createdAt).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          dateStyle: "medium",
                          timeStyle: "medium",
                        }) + " IST"
                      : "Recent"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-[#806B6A]">Detection UTC Timestamp:</span>
                  <span className="font-mono text-[#806B6A]">
                    {activeIncident.capturedAt || activeIncident.createdAt
                      ? new Date(activeIncident.capturedAt || activeIncident.createdAt).toISOString()
                      : "N/A"}
                  </span>
                </div>
              </div>

              {/* Email Delivery Audit & Retry (Requirement 3, 6, 8) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Mail size={14} className="text-slate-600" />
                    Email Notification Status
                  </span>
                  {["SUPER_ADMIN", "DEPT_HEAD", "FACULTY"].includes(user?.role) && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={Send}
                      loading={retryEmailLoading}
                      onClick={handleRetryEmail}
                      className="text-xs h-7 px-2"
                    >
                      Retry Email Dispatch
                    </Button>
                  )}
                </div>

                <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                  <p>
                    <span className="font-medium">Status: </span>
                    <span className="capitalize">{activeIncident.emailStatus?.replace(/_/g, " ") || "Not triggered"}</span>
                    {activeIncident.emailSentAt && (
                      <span className="ml-2 text-slate-400">
                        (Sent: {new Date(activeIncident.emailSentAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST)
                      </span>
                    )}
                  </p>
                  {activeIncident.emailRecipients?.length > 0 && (
                    <p>
                      <span className="font-medium">Recipients: </span>
                      {activeIncident.emailRecipients.join(", ")}
                    </p>
                  )}
                  {activeIncident.emailError && (
                    <p className="text-rose-600 font-mono text-[10px]">
                      Error: {activeIncident.emailError}
                    </p>
                  )}
                </div>
              </div>

              {/* Privacy-Protected Evidence Section (Requirement E) */}
              <div className="rounded-xl border border-[#E5D6D6] bg-[#FBF3F3] p-4">
                <EvidenceViewer
                  evidence={activeIncident.evidence}
                  cameraSource={activeIncident.camera?.cameraId || activeIncident.camera}
                  userRole={user?.role}
                />
              </div>

              {/* Authorized Status Transition Workflow */}
              <div className="border-t border-[#E5D6D6] pt-4">
                <p className="font-semibold text-[#3C1414] mb-2">
                  Authorized Investigation Workflow
                </p>

                {allowedNextStatuses.length === 0 ? (
                  <p className="text-[#806B6A] italic">
                    This incident has reached terminal state ({activeIncident.status}). No further status transitions permitted.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {allowedNextStatuses.map((nextStatus) => (
                      <Button
                        key={nextStatus}
                        size="sm"
                        variant={
                          nextStatus === "resolved"
                            ? "primary"
                            : nextStatus === "dismissed"
                            ? "outline"
                            : "secondary"
                        }
                        loading={actionLoading}
                        onClick={() => handleStatusTransition(nextStatus)}
                        className="min-h-[44px]"
                      >
                        Mark as {nextStatus}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSelectedIncident(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
