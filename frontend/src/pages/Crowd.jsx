import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Search,
  RefreshCw,
  Clock,
} from "lucide-react";
import { occupancyApi } from "../services/campusApi";
import useSocketEvent from "../hooks/useSocketEvent";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  PageHeader,
  Skeleton,
  EmptyState,
  ErrorState,
} from "../components/ui";

export default function Crowd() {
  const [occupancy, setOccupancy] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");

  const fetchOccupancy = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await occupancyApi.list();
      setOccupancy(data || []);
    } catch {
      setError("Failed to fetch zone occupancy records from server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await occupancyApi.list();
        if (active) setOccupancy(data || []);
      } catch {
        if (active) setError("Failed to fetch zone occupancy records from server.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  // Realtime updates from Socket.IO
  useSocketEvent("occupancy:updated", (event) => {
    setOccupancy((prev) => {
      const exists = prev.some((o) => o.zoneName === event.zoneName);
      if (exists) {
        return prev.map((o) => (o.zoneName === event.zoneName ? { ...o, ...event } : o));
      }
      return [event, ...prev];
    });
  });

  const filteredOccupancy = useMemo(() => {
    return occupancy.filter((zone) => {
      const matchesSearch =
        search === "" ||
        zone.zoneName?.toLowerCase().includes(search.toLowerCase()) ||
        zone.cameraId?.toLowerCase().includes(search.toLowerCase());

      const matchesLevel =
        levelFilter === "all" || zone.level === levelFilter;

      return matchesSearch && matchesLevel;
    });
  }, [occupancy, search, levelFilter]);

  const totalHeadcount = occupancy.reduce((acc, o) => acc + (o.peopleCount || 0), 0);
  const totalCapacity = occupancy.reduce((acc, o) => acc + (o.capacity || 0), 0);
  const averageUtilization =
    totalCapacity > 0 ? Math.round((totalHeadcount / totalCapacity) * 100) : 0;
  const criticalCount = occupancy.filter((o) => o.level === "critical").length;
  const warningCount = occupancy.filter((o) => o.level === "warning").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Crowd Monitoring"
        description="Real-time headcounts, zone occupancy levels, and crowd congestion alert thresholds"
        icon={Users}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchOccupancy}
          loading={loading}
          icon={RefreshCw}
        >
          Refresh Zones
        </Button>
      </PageHeader>

      {error && (
        <ErrorState
          title="Occupancy records unavailable"
          description={error}
          onRetry={fetchOccupancy}
        />
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#806B6A]">
              Total Observed
            </p>
            <p className="mt-1 text-2xl font-bold text-[#3C1414]">
              {loading ? "..." : totalHeadcount}
            </p>
            <p className="mt-1 text-xs text-[#806B6A]">Live campus headcount</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#806B6A]">
              Monitored Zones
            </p>
            <p className="mt-1 text-2xl font-bold text-[#3C1414]">
              {loading ? "..." : occupancy.length}
            </p>
            <p className="mt-1 text-xs text-[#806B6A]">Active sensory sectors</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#806B6A]">
              Mean Utilization
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#3C1414]">
                {loading ? "..." : `${averageUtilization}%`}
              </span>
              <span className="text-xs text-[#806B6A]">density</span>
            </div>
            <p className="mt-1 text-xs text-[#806B6A]">Across monitored areas</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#806B6A]">
              High Congestion Zones
            </p>
            <p
              className={`mt-1 text-2xl font-bold ${
                criticalCount > 0
                  ? "text-[#C62828]"
                  : warningCount > 0
                  ? "text-[#A66A00]"
                  : "text-[#287A43]"
              }`}
            >
              {loading ? "..." : criticalCount + warningCount}
            </p>
            <p className="mt-1 text-xs text-[#806B6A]">
              {criticalCount} critical, {warningCount} warning
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#806B6A]"
          />
          <input
            type="text"
            placeholder="Search zones by name or camera ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#E5D6D6] bg-white py-2 pl-10 pr-4 text-sm text-[#3C1414] placeholder-[#806B6A] transition focus:border-[#B26262] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-[#E5D6D6] bg-white p-1 text-xs overflow-x-auto no-scrollbar max-w-full">
          <button
            type="button"
            onClick={() => setLevelFilter("all")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              levelFilter === "all"
                ? "bg-[#B26262] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            All Zones ({occupancy.length})
          </button>
          <button
            type="button"
            onClick={() => setLevelFilter("normal")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              levelFilter === "normal"
                ? "bg-[#287A43] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            Normal
          </button>
          <button
            type="button"
            onClick={() => setLevelFilter("warning")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              levelFilter === "warning"
                ? "bg-[#A66A00] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            Warning
          </button>
          <button
            type="button"
            onClick={() => setLevelFilter("critical")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              levelFilter === "critical"
                ? "bg-[#C62828] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            Critical
          </button>
        </div>
      </div>

      {/* Zone Occupancy Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      ) : filteredOccupancy.length === 0 ? (
        <EmptyState
          title={
            search || levelFilter !== "all"
              ? "No occupancy zones found"
              : "No monitored crowd zones registered."
          }
          description={
            search || levelFilter !== "all"
              ? "No zone telemetry records match your current filter."
              : "Campus sensory sectors configured by administrators will display real-time headcounts here."
          }
          icon={Users}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredOccupancy.map((zone) => {
            const pct =
              zone.capacity > 0
                ? Math.min(100, Math.round((zone.peopleCount / zone.capacity) * 100))
                : 0;

            return (
              <Card
                key={zone.zoneName || zone._id}
                className="flex flex-col justify-between overflow-hidden transition hover:shadow-md"
              >
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{zone.zoneName}</CardTitle>
                      <CardDescription className="font-mono text-[11px] mt-0.5">
                        Cam Ref: {zone.cameraId}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        zone.level === "critical"
                          ? "danger"
                          : zone.level === "warning"
                          ? "warning"
                          : "success"
                      }
                      dot
                    >
                      {zone.level}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-0 space-y-4">
                  {/* Headcount Stat */}
                  <div className="flex items-baseline justify-between rounded-xl bg-[#F6EDED] p-3.5">
                    <div>
                      <p className="text-xs text-[#806B6A]">People Count</p>
                      <p className="text-xl font-bold text-[#3C1414]">
                        {zone.peopleCount}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[#806B6A]">Configured Capacity</p>
                      <p className="text-sm font-semibold text-[#3C1414]">
                        {zone.capacity} max
                      </p>
                    </div>
                  </div>

                  {/* Density Meter */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-[#806B6A]">
                      <span>Threshold Density</span>
                      <span className="font-semibold">{pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#F6EDED]">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          pct >= 90
                            ? "bg-[#C62828]"
                            : pct >= 70
                            ? "bg-[#A66A00]"
                            : "bg-[#287A43]"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#806B6A] pt-1 border-t border-[#E5D6D6]">
                    <span>
                      {pct >= 90 ? (
                        <span className="font-medium text-[#C62828]">
                          Critical threshold exceeded
                        </span>
                      ) : pct >= 70 ? (
                        <span className="font-medium text-[#A66A00]">
                          Warning threshold reached
                        </span>
                      ) : (
                        <span className="text-[#287A43]">
                          Optimal crowd density
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {zone.observedAt
                        ? new Date(zone.observedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Live"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
