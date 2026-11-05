import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  Car,
  Users,
  Building2,
  AlertTriangle,
  ChevronRight,
  ArrowRight,
  Video,
  VideoOff,
  Calendar,
  FlaskConical,
  BookOpen,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useSocket } from "../hooks/useSocket";
import useSocketEvent from "../hooks/useSocketEvent";
import {
  cameraApi,
  incidentApi,
  occupancyApi,
  parkingApi,
} from "../services/campusApi";
import { canViewEvidence } from "../utils/rolePermissions";
import { formatRelativeTime } from "../utils/time";
import { ErrorState } from "../components/ui";
import CameraDetailModal from "../features/cameras/CameraDetailModal";

export default function Dashboard() {
  const { user, isStaff } = useAuth();
  const { connected } = useSocket();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [cameras, setCameras] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [occupancy, setOccupancy] = useState([]);
  const [parking, setParking] = useState([]);

  // Live selected camera for modal inspection
  const [selectedCamera, setSelectedCamera] = useState(null);

  // Live date & time state
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const promises = [
        parkingApi.list().catch(() => []),
        occupancyApi.list().catch(() => []),
      ];

      if (isStaff) {
        promises.push(cameraApi.list().catch(() => []));
        promises.push(incidentApi.list().catch(() => []));
      }

      const results = await Promise.all(promises);

      setParking(results[0] || []);
      setOccupancy(results[1] || []);

      if (isStaff) {
        setCameras(results[2] || []);
        setIncidents(results[3] || []);
      }
    } catch {
      setError(
        "Unable to load initial dashboard telemetry from server."
      );
    } finally {
      setLoading(false);
    }
  }, [isStaff]);

  useEffect(() => {
    let active = true;

    async function initialize() {
      try {
        const promises = [
          parkingApi.list().catch(() => []),
          occupancyApi.list().catch(() => []),
        ];

        if (isStaff) {
          promises.push(cameraApi.list().catch(() => []));
          promises.push(incidentApi.list().catch(() => []));
        }

        const results = await Promise.all(promises);

        if (active) {
          setParking(results[0] || []);
          setOccupancy(results[1] || []);
          if (isStaff) {
            setCameras(results[2] || []);
            setIncidents(results[3] || []);
          }
        }
      } catch {
        if (active) {
          setError(
            "Unable to load initial dashboard telemetry from server."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    initialize();

    return () => {
      active = false;
    };
  }, [isStaff]);

  const wasConnectedRef = useRef(false);

  // Reconcile missed updates when socket reconnects
  useEffect(() => {
    if (connected && wasConnectedRef.current === false) {
      loadDashboardData();
    }
    wasConnectedRef.current = connected;
  }, [connected, loadDashboardData]);

  // Realtime Socket Event Handlers
  useSocketEvent("camera:status", (event) => {
    if (!isStaff) return;
    setCameras((prev) =>
      prev.map((cam) =>
        cam.cameraId === event.cameraId || cam._id === event.id
          ? { ...cam, status: event.status }
          : cam
      )
    );
  });

  useSocketEvent("incident:created", (event) => {
    if (!isStaff) return;
    setIncidents((prev) => [
      event,
      ...prev.filter((i) => i.incidentId !== event.incidentId && i._id !== event._id),
    ]);
  });

  useSocketEvent("incident:updated", (event) => {
    if (!isStaff) return;
    setIncidents((prev) =>
      prev.map((i) =>
        (i.incidentId && i.incidentId === event.incidentId) || (i._id && i._id === event._id)
          ? { ...i, ...event }
          : i
      )
    );
  });

  useSocketEvent("parking:updated", (event) => {
    setParking((prev) => {
      const exists = prev.some((p) => p.zoneId === event.zoneId || p._id === event._id);
      if (exists) {
        return prev.map((p) =>
          p.zoneId === event.zoneId || p._id === event._id ? { ...p, ...event } : p
        );
      }
      return [...prev, event];
    });
  });

  useSocketEvent("occupancy:updated", (event) => {
    setOccupancy((prev) => {
      const exists = prev.some(
        (o) =>
          o.zoneName === event.zoneName ||
          o._id === event._id ||
          (o.cameraId && event.cameraId && o.cameraId === event.cameraId)
      );
      if (exists) {
        return prev.map((o) =>
          o.zoneName === event.zoneName ||
          o._id === event._id ||
          (o.cameraId && event.cameraId && o.cameraId === event.cameraId)
            ? { ...o, ...event }
            : o
        );
      }
      return [...prev, event];
    });
  });

  // Purely Real Database Metric Computations (Zero Mock Fallbacks)
  const totalParkingCapacity = parking.reduce(
    (acc, p) => acc + (p.totalSpaces || 0),
    0
  );
  const totalParkingOccupied = parking.reduce(
    (acc, p) => acc + (p.occupiedSpaces || 0),
    0
  );
  const totalParkingAvailable = parking.reduce(
    (acc, p) => acc + (p.availableSpaces ?? Math.max(0, (p.totalSpaces || 0) - (p.occupiedSpaces || 0))),
    0
  );
  const parkingOccupancyPct =
    totalParkingCapacity > 0
      ? Math.round((totalParkingOccupied / totalParkingCapacity) * 100)
      : 0;

  // Canteen / Common Area Crowd Metrics
  const canteenZone = occupancy.find(
    (o) =>
      o.zoneName?.toLowerCase().includes("canteen") ||
      o.zoneName?.toLowerCase().includes("atrium") ||
      o.zoneName?.toLowerCase().includes("hall")
  ) || occupancy[0];

  const canteenCount = canteenZone ? Number(canteenZone.peopleCount || 0) : 0;
  const canteenCapacity = canteenZone ? Number(canteenZone.capacity || 0) : 0;
  const canteenPct =
    canteenCapacity > 0
      ? Math.min(100, Math.round((canteenCount / canteenCapacity) * 100))
      : 0;
  const canteenStatus = !canteenZone
    ? "No Data"
    : canteenZone.level === "critical"
    ? "Critical"
    : canteenZone.level === "warning"
    ? "Moderate"
    : "Normal";

  // Monitored Campus Zones Metrics
  const totalMonitoredZones = occupancy.length;
  const normalOccupancyZones = occupancy.filter((o) => o.level === "normal").length;
  const zoneHealthPct =
    totalMonitoredZones > 0
      ? Math.round((normalOccupancyZones / totalMonitoredZones) * 100)
      : 0;

  // Active Incident Metrics
  const activeIncidents = incidents.filter(
    (i) => i.status !== "resolved" && i.status !== "dismissed"
  );
  const criticalCount = activeIncidents.filter(
    (i) => i.severity === "critical" || i.severity === "high"
  ).length;
  const incidentProgressPct =
    incidents.length > 0
      ? Math.min(100, Math.round((activeIncidents.length / incidents.length) * 100))
      : 0;

  // Date and Time Formatting
  const formattedDate = currentTime.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const formattedTime = currentTime.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const canSeeEvidence = canViewEvidence(user?.role);

  return (
    <div className="space-y-6 pb-8">
      {/* 1. Dashboard Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#3C1414] sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1 text-xs text-[#806B6A] sm:text-sm">
            Real-time overview of campus activities
          </p>
        </div>

        {/* Date & Time Widget */}
        <div className="flex shrink-0 items-center gap-2.5 self-start rounded-xl border border-[#E5D6D6] bg-white px-3.5 py-2 shadow-xs sm:self-auto">
          <Calendar size={18} className="text-[#806B6A]" />
          <div className="text-right">
            <p className="text-xs font-semibold leading-tight text-[#3C1414]">
              {formattedDate}
            </p>
            <p className="text-[11px] font-medium leading-tight text-[#806B6A]">
              {formattedTime}
            </p>
          </div>
          {loading && (
            <span
              className="inline-block h-2 w-2 animate-ping rounded-full bg-[#B26262]"
              title="Updating telemetry..."
              aria-label="Updating telemetry..."
            />
          )}
        </div>
      </div>

      {error && (
        <ErrorState
          title="Dashboard telemetry unavailable"
          description={error}
          onRetry={loadDashboardData}
        />
      )}

      {/* 2. Four Summary KPI Cards (Derived Exclusively From Authoritative Real Data) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* KPI 1: Parking Slots */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-white p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#B26262]/10 text-[#B26262]">
              <Car size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#806B6A]">Parking Slots</p>
              {totalParkingCapacity > 0 ? (
                <>
                  <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#3C1414]">
                    {totalParkingOccupied} / {totalParkingCapacity}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#B26262]">
                    {parkingOccupancyPct}% Used
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-0.5 text-sm font-semibold text-[#806B6A]">
                    No records available
                  </p>
                  <p className="mt-1 text-xs text-[#806B6A]/80">
                    Parking unconfigured
                  </p>
                </>
              )}
            </div>
          </div>
          {/* Horizontal Progress Bar */}
          <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F6EDED]">
            <div
              className="h-full rounded-full bg-[#B26262] transition-all duration-500"
              style={{ width: `${parkingOccupancyPct}%` }}
            />
          </div>
        </div>

        {/* KPI 2: Crowd Density */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-white p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#8C8C7C]/15 text-[#8C8C7C]">
              <Users size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#806B6A]">
                {canteenZone?.zoneName ? `${canteenZone.zoneName} Crowd` : "Campus Crowd"}
              </p>
              {canteenZone && canteenCapacity > 0 ? (
                <>
                  <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#3C1414]">
                    {canteenCount} people
                  </p>
                  <p className={`mt-1 text-xs font-semibold ${canteenStatus === "Critical" ? "text-[#C62828]" : canteenStatus === "Moderate" ? "text-[#A66A00]" : "text-[#287A43]"}`}>
                    {canteenStatus}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-0.5 text-sm font-semibold text-[#806B6A]">
                    No crowd telemetry
                  </p>
                  <p className="mt-1 text-xs text-[#806B6A]/80">
                    Awaiting AI detection
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F6EDED]">
            <div
              className={`h-full rounded-full transition-all duration-500 ${canteenStatus === "Critical" ? "bg-[#C62828]" : canteenStatus === "Moderate" ? "bg-[#A66A00]" : "bg-[#287A43]"}`}
              style={{ width: `${canteenPct}%` }}
            />
          </div>
        </div>

        {/* KPI 3: Monitored Zones */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-white p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#76808D]/15 text-[#76808D]">
              <Building2 size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#806B6A]">Monitored Zones</p>
              {totalMonitoredZones > 0 ? (
                <>
                  <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#3C1414]">
                    {normalOccupancyZones} / {totalMonitoredZones}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-[#8C8C7C]">
                    Optimal Capacity
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-0.5 text-sm font-semibold text-[#806B6A]">
                    No zones configured
                  </p>
                  <p className="mt-1 text-xs text-[#806B6A]/80">
                    Zero active sensors
                  </p>
                </>
              )}
            </div>
          </div>
          <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F6EDED]">
            <div
              className="h-full rounded-full bg-[#8C8C7C] transition-all duration-500"
              style={{ width: `${zoneHealthPct}%` }}
            />
          </div>
        </div>

        {/* KPI 4: Active Incidents */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-white p-5 shadow-xs transition hover:shadow-md">
          <div className="flex items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#C62828]/10 text-[#C62828]">
              <AlertTriangle size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[#806B6A]">Active Incidents</p>
              <p className="mt-0.5 text-2xl font-bold tracking-tight text-[#3C1414]">
                {activeIncidents.length}
              </p>
              <p className={`mt-1 text-xs font-semibold ${criticalCount > 0 ? "text-[#C62828]" : "text-[#287A43]"}`}>
                {criticalCount} Critical
              </p>
            </div>
          </div>
          <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F6EDED]">
            <div
              className="h-full rounded-full bg-[#C62828] transition-all duration-500"
              style={{ width: `${incidentProgressPct}%` }}
            />
          </div>
        </div>
      </div>

      {/* 3. Main Analytics Section (Realtime Telemetry Representation) */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Panel 1: Parking Occupancy (Doughnut Chart + Legend) */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E5D6D6] pb-3">
            <Link
              to="/parking"
              className="group flex items-center gap-1.5 text-sm font-bold text-[#3C1414] transition hover:text-[#B26262]"
            >
              <Car size={16} className="text-[#806B6A] transition group-hover:text-[#B26262]" />
              <span>Parking Occupancy</span>
              <ChevronRight size={15} className="text-[#806B6A] transition group-hover:translate-x-0.5" />
            </Link>
            <ChevronRight size={16} className="text-[#806B6A]/50" />
          </div>

          {totalParkingCapacity === 0 ? (
            <div className="my-auto py-10 text-center text-xs text-[#806B6A]">
              <Car size={24} className="mx-auto mb-2 text-[#806B6A]/40" />
              <p>No parking lots configured</p>
            </div>
          ) : (
            <div className="my-auto flex flex-col xs:flex-row items-center justify-between gap-4 py-4">
              {/* Doughnut Chart */}
              <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
                <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 120 120">
                  {/* Background Track */}
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    stroke="#F6EDED"
                    strokeWidth="13"
                    fill="none"
                  />
                  {/* Available Arc (Soft Khaki #8C8C7C) */}
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    stroke="#8C8C7C"
                    strokeWidth="13"
                    fill="none"
                    strokeDasharray="289"
                    strokeDashoffset="0"
                  />
                  {/* Occupied Arc (Muted Rose #B26262) */}
                  <circle
                    cx="60"
                    cy="60"
                    r="46"
                    stroke="#B26262"
                    strokeWidth="13"
                    fill="none"
                    strokeDasharray="289"
                    strokeDashoffset={289 - (289 * parkingOccupancyPct) / 100}
                    strokeLinecap="round"
                  />
                </svg>
                {/* Centered Percentage */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-2xl font-bold tracking-tight text-[#3C1414]">
                    {parkingOccupancyPct}%
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#806B6A]">
                    Occupied
                  </span>
                </div>
              </div>

              {/* Right-Aligned Legend */}
              <div className="space-y-3 pr-2 text-xs">
                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#B26262]" />
                    <span className="font-medium text-[#806B6A]">Occupied</span>
                  </div>
                  <span className="font-bold text-[#3C1414]">{totalParkingOccupied}</span>
                </div>

                <div className="flex items-center justify-between gap-6">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#8C8C7C]" />
                    <span className="font-medium text-[#806B6A]">Available</span>
                  </div>
                  <span className="font-bold text-[#3C1414]">{totalParkingAvailable}</span>
                </div>

                <div className="flex items-center justify-between gap-6 border-t border-[#E5D6D6] pt-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#76808D]" />
                    <span className="font-medium text-[#806B6A]">Total</span>
                  </div>
                  <span className="font-bold text-[#3C1414]">{totalParkingCapacity}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Panel 2: Live Zone Crowd Distribution (Driven 100% by live occupancy records) */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E5D6D6] pb-3">
            <Link
              to="/crowd"
              className="group flex items-center gap-1.5 text-sm font-bold text-[#3C1414] transition hover:text-[#B26262]"
            >
              <span>Live Crowd Density</span>
              <ChevronRight size={15} className="text-[#806B6A] transition group-hover:translate-x-0.5" />
            </Link>
            <ChevronRight size={16} className="text-[#806B6A]/50" />
          </div>

          {occupancy.length === 0 ? (
            <div className="my-auto py-10 text-center text-xs text-[#806B6A]">
              <Users size={24} className="mx-auto mb-2 text-[#806B6A]/40" />
              <p>No live crowd telemetry recorded</p>
            </div>
          ) : (
            <div className="my-auto space-y-3.5 py-3">
              {occupancy.slice(0, 3).map((zone) => {
                const zonePct = zone.capacity > 0
                  ? Math.min(100, Math.round((zone.peopleCount / zone.capacity) * 100))
                  : 0;
                const isCritical = zone.level === "critical" || zonePct >= 90;
                const isWarning = zone.level === "warning" || zonePct >= 70;

                return (
                  <div key={zone._id || zone.zoneName} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#3C1414] truncate max-w-[160px]">
                        {zone.zoneName}
                      </span>
                      <span className="font-mono text-[#806B6A] font-medium">
                        {zone.peopleCount} / {zone.capacity} ({zonePct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#F6EDED]">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isCritical
                            ? "bg-[#C62828]"
                            : isWarning
                            ? "bg-[#A66A00]"
                            : "bg-[#287A43]"
                        }`}
                        style={{ width: `${zonePct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Panel 3: Resources Availability (Derived from Active Occupancy Sectors) */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between border-b border-[#E5D6D6] pb-3">
            <Link
              to="/resources"
              className="group flex items-center gap-1.5 text-sm font-bold text-[#3C1414] transition hover:text-[#B26262]"
            >
              <span>Resources Availability</span>
              <ChevronRight size={15} className="text-[#806B6A] transition group-hover:translate-x-0.5" />
            </Link>
            <ChevronRight size={16} className="text-[#806B6A]/50" />
          </div>

          {occupancy.length === 0 ? (
            <div className="my-auto py-10 text-center text-xs text-[#806B6A]">
              <Building2 size={24} className="mx-auto mb-2 text-[#806B6A]/40" />
              <p>No campus resource telemetry available</p>
            </div>
          ) : (
            <div className="my-auto space-y-4 py-3">
              {occupancy.slice(0, 3).map((zone, idx) => {
                const available = Math.max(0, (zone.capacity || 0) - (zone.peopleCount || 0));
                const availablePct = zone.capacity > 0
                  ? Math.min(100, Math.round((available / zone.capacity) * 100))
                  : 0;

                const icon = idx === 0 ? Building2 : idx === 1 ? FlaskConical : BookOpen;
                const IconComponent = icon;

                return (
                  <div key={zone._id || zone.zoneName} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#B26262]/10 text-[#B26262]">
                          <IconComponent size={16} />
                        </div>
                        <span className="text-xs font-semibold text-[#3C1414] truncate max-w-[150px]">
                          {zone.zoneName}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[#3C1414]">
                        {available} / {zone.capacity} available
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F6EDED]">
                      <div
                        className="h-full rounded-full bg-[#B26262] transition-all duration-500"
                        style={{ width: `${availablePct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 4. Live Camera Feeds Section (Real Database Cameras Only) */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video size={16} className="text-[#3C1414]" />
            <h2 className="text-sm font-bold text-[#3C1414]">Campus Surveillance Cameras</h2>
            <ChevronRight size={14} className="text-[#806B6A]" />
          </div>

          <Link
            to="/cameras"
            className="flex items-center gap-1 text-xs font-semibold text-[#B26262] hover:text-[#9E5353]"
          >
            <span>View All Cameras</span>
            <ArrowRight size={14} />
          </Link>
        </div>

        {!isStaff ? (
          <div className="rounded-2xl border border-[#E5D6D6] bg-white p-8 text-center text-xs text-[#806B6A]">
            Camera surveillance telemetry is restricted to campus staff.
          </div>
        ) : cameras.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#E5D6D6] bg-white p-8 text-center">
            <Video size={28} className="mx-auto mb-2 text-[#806B6A]/50" />
            <p className="text-sm font-semibold text-[#3C1414]">No cameras registered.</p>
            <p className="text-xs text-[#806B6A] mt-1">
              Surveillance nodes registered by administrators will appear here with genuine telemetry.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cameras.slice(0, 4).map((cam) => {
              const isHeartbeatVerified = Boolean(
                cam.lastHeartbeat && Date.now() - new Date(cam.lastHeartbeat).getTime() < 5 * 60 * 1000
              );
              const isOnline = cam.status === "online" && isHeartbeatVerified;
              const hasLiveStream = Boolean(cam.hasActiveStream && cam.streamUrl);

              return (
                <div
                  key={cam._id || cam.cameraId}
                  onClick={() => setSelectedCamera(cam)}
                  className="group cursor-pointer overflow-hidden rounded-2xl border border-[#E5D6D6] bg-white shadow-xs transition hover:shadow-md"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-slate-900">
                    {hasLiveStream ? (
                      <div className="flex h-full w-full items-center justify-center">
                        <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md bg-[#287A43] px-2 py-0.5 text-[10px] font-bold text-white shadow-xs">
                          <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                          Live
                        </span>
                      </div>
                    ) : isOnline ? (
                      <div className="flex h-full w-full flex-col items-center justify-center p-3 text-center">
                        <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">
                          Footage Unavailable
                        </span>
                        <Video size={22} className="text-slate-400 mb-1" />
                        <p className="text-xs font-semibold text-slate-200 truncate max-w-[180px]">{cam.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{cam.cameraId}</p>
                        <p className="text-[10px] text-amber-400/90 mt-1">Live stream not connected</p>
                      </div>
                    ) : (
                      <div className="relative flex aspect-video w-full flex-col items-center justify-center bg-slate-900 p-3 text-center">
                        <span className="absolute right-2.5 top-2.5 rounded-md bg-[#C62828] px-2 py-0.5 text-[10px] font-medium text-white">
                          Disconnected
                        </span>
                        <VideoOff size={22} className="mb-1 text-slate-400" />
                        <p className="text-xs font-semibold leading-tight text-slate-200">
                          Camera is Disconnected
                        </p>
                        <p className="text-[10px] text-slate-400">
                          Footage Not Available
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="p-3.5">
                    <p className="text-xs font-bold text-[#3C1414] truncate">{cam.name}</p>
                    <p className="mt-1 text-xs text-[#806B6A] truncate">
                      {cam.location || cam.building || "Campus Edge Node"}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#806B6A]/80">
                      {cam.lastHeartbeat
                        ? `Last heartbeat: ${formatRelativeTime(cam.lastHeartbeat)}`
                        : "No heartbeat received"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Recent Incidents and Quick Actions */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left Column (lg:col-span-2): Recent Incidents Table */}
        <div className="rounded-2xl border border-[#E5D6D6] bg-white p-5 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[#E5D6D6] pb-3">
            <Link
              to="/incidents"
              className="group flex items-center gap-1.5 text-sm font-bold text-[#3C1414] transition hover:text-[#B26262]"
            >
              <span>Recent Incidents</span>
              <ChevronRight size={15} className="text-[#806B6A] transition group-hover:translate-x-0.5" />
            </Link>

            <Link
              to="/incidents"
              className="flex items-center gap-1 text-xs font-semibold text-[#B26262] hover:text-[#9E5353]"
            >
              <span>View All</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          {!isStaff ? (
            <div className="py-8 text-center text-xs text-[#806B6A]">
              Security incident log is restricted to authorized campus staff.
            </div>
          ) : incidents.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#806B6A]">
              <AlertTriangle size={24} className="mx-auto mb-2 text-[#806B6A]/40" />
              <p>No campus security incidents reported.</p>
            </div>
          ) : (
            <div className="divide-y divide-[#E5D6D6]">
              {incidents.slice(0, 3).map((incident) => {
                const severity = (incident.severity || "info").toLowerCase();
                const isHigh = severity === "critical" || severity === "high";
                const isMedium = severity === "warning" || severity === "medium";

                // Section 6 Mandatory Severity Badges
                const badgeStyle = isHigh
                  ? "bg-[#FDECEC] text-[#C62828] border border-[#C62828]/30"
                  : isMedium
                  ? "bg-[#FFF4CC] text-[#A66A00] border border-[#A66A00]/30"
                  : "bg-[#E7F5EA] text-[#287A43] border border-[#287A43]/30";
                const badgeLabel = isHigh ? "HIGH" : isMedium ? "MEDIUM" : "LOW";

                const eventLabel = incident.eventType
                  ? incident.eventType
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (c) => c.toUpperCase())
                  : "Security Alert";

                const camName = incident.camera?.name || incident.cameraName || "CCTV Camera";
                const camId = incident.camera?.cameraId || incident.cameraId || "CAM";
                const loc = incident.camera?.location || incident.location || incident.metadata?.location || "Campus Zone";
                const bld = incident.camera?.building || incident.building || incident.metadata?.building || "";
                const fullLoc = bld ? `${loc} • ${bld}` : loc;

                const peopleCount = incident.metadata?.people_count ?? incident.metadata?.peopleCount ?? incident.peopleCount;
                const threshold = incident.metadata?.threshold ?? incident.threshold ?? 4;
                const incidentDbId = incident._id || incident.id;

                let istTime = "";
                if (incident.createdAt) {
                  try {
                    istTime = new Intl.DateTimeFormat("en-IN", {
                      timeZone: "Asia/Kolkata",
                      day: "2-digit",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12: true,
                    }).format(new Date(incident.createdAt)) + " IST";
                  } catch {}
                }

                return (
                  <div
                    key={incident._id || incident.incidentId}
                    className="flex flex-col xs:flex-row xs:items-center justify-between gap-3 sm:gap-4 py-3.5 transition hover:bg-[#FBF3F3]/60 px-2 rounded-xl"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`shrink-0 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${badgeStyle}`}
                      >
                        {badgeLabel}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-bold text-[#3C1414] sm:text-sm">
                            {eventLabel}
                          </p>
                          {peopleCount !== undefined && peopleCount !== null && (
                            <span className="shrink-0 rounded-md bg-[#DC2626]/10 px-2 py-0.5 text-[10px] font-bold text-[#DC2626]">
                              {peopleCount} People (Max: {threshold})
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-[#806B6A]">
                          {incident.description || fullLoc}
                        </p>
                        <p className="truncate text-[10px] text-[#806B6A]/80 mt-0.5">
                          {camName} ({camId}) &bull; {fullLoc}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-3 sm:gap-4 self-end xs:self-auto">
                      <div className="text-right">
                        <p className="text-[11px] font-medium text-[#3C1414] font-mono">
                          {istTime || formatRelativeTime(incident.createdAt)}
                        </p>
                        <span className="text-[10px] text-[#806B6A]">
                          {formatRelativeTime(incident.createdAt)}
                        </span>
                      </div>

                      {/* Evidence Thumbnail */}
                      <div className="h-9 w-12 sm:h-10 sm:w-16 shrink-0 overflow-hidden rounded-lg border border-[#E5D6D6] bg-[#F6EDED]">
                        {canSeeEvidence ? (
                          incident.evidence && incident.evidence.length > 0 ? (
                            <img
                              src={incident.evidence[0].url || incident.evidence[0].thumbnailUrl}
                              alt="Incident evidence snapshot"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[#F6EDED] text-[10px] font-semibold text-[#806B6A]">
                              No image
                            </div>
                          )
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-[#F6EDED] text-[9px] font-semibold text-[#806B6A]">
                            Restricted
                          </div>
                        )}
                      </div>

                      {/* Link to Open Details */}
                      <Link
                        to={incidentDbId ? `/incidents?id=${incidentDbId}` : "/incidents"}
                        className="rounded-lg border border-[#E5D6D6] bg-white px-2.5 py-1 text-xs font-semibold text-[#B26262] transition hover:bg-[#B26262] hover:text-white"
                        title="Open incident details"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column (lg:col-span-1): Quick Actions */}
        <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-white p-5 shadow-xs">
          <h2 className="border-b border-[#E5D6D6] pb-3 text-sm font-bold text-[#3C1414]">
            Quick Actions
          </h2>

          <div className="my-auto grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3 py-3">
            {/* Action 1: View Parking */}
            <Link
              to="/parking"
              className="group flex items-center justify-between rounded-xl border border-[#E5D6D6] p-3 transition hover:border-[#B26262]/40 hover:bg-[#F6EDED]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#B26262]/10 text-[#B26262] transition group-hover:bg-[#B26262] group-hover:text-white">
                  <Car size={18} />
                </div>
                <span className="truncate text-xs font-bold text-[#3C1414]">
                  View Parking
                </span>
              </div>
              <ChevronRight
                size={14}
                className="shrink-0 text-[#806B6A] transition group-hover:translate-x-0.5 group-hover:text-[#B26262]"
              />
            </Link>

            {/* Action 2: Check Canteen */}
            <Link
              to="/crowd"
              className="group flex items-center justify-between rounded-xl border border-[#E5D6D6] p-3 transition hover:border-[#B26262]/40 hover:bg-[#F6EDED]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#8C8C7C]/15 text-[#8C8C7C] transition group-hover:bg-[#8C8C7C] group-hover:text-white">
                  <Users size={18} />
                </div>
                <span className="truncate text-xs font-bold text-[#3C1414]">
                  Check Crowd
                </span>
              </div>
              <ChevronRight
                size={14}
                className="shrink-0 text-[#806B6A] transition group-hover:translate-x-0.5 group-hover:text-[#8C8C7C]"
              />
            </Link>

            {/* Action 3: Find Resources */}
            <Link
              to="/resources"
              className="group flex items-center justify-between rounded-xl border border-[#E5D6D6] p-3 transition hover:border-[#B26262]/40 hover:bg-[#F6EDED]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#76808D]/15 text-[#76808D] transition group-hover:bg-[#76808D] group-hover:text-white">
                  <Building2 size={18} />
                </div>
                <span className="truncate text-xs font-bold text-[#3C1414]">
                  Resources
                </span>
              </div>
              <ChevronRight
                size={14}
                className="shrink-0 text-[#806B6A] transition group-hover:translate-x-0.5 group-hover:text-[#76808D]"
              />
            </Link>

            {/* Action 4: View Incidents */}
            <Link
              to="/incidents"
              className="group flex items-center justify-between rounded-xl border border-[#E5D6D6] p-3 transition hover:border-[#B26262]/40 hover:bg-[#F6EDED]"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#B26262]/10 text-[#B26262] transition group-hover:bg-[#B26262] group-hover:text-white">
                  <AlertTriangle size={18} />
                </div>
                <span className="truncate text-xs font-bold text-[#3C1414]">
                  Incidents
                </span>
              </div>
              <ChevronRight
                size={14}
                className="shrink-0 text-[#806B6A] transition group-hover:translate-x-0.5 group-hover:text-[#B26262]"
              />
            </Link>
          </div>
        </div>
      </div>

      {/* Interactive Camera Detail & Diagnostics Modal */}
      <CameraDetailModal
        camera={selectedCamera}
        isOpen={Boolean(selectedCamera)}
        onClose={() => setSelectedCamera(null)}
      />
    </div>
  );
}
