import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CarFront,
  Search,
  RefreshCw,
  Clock,
  MapPin,
} from "lucide-react";
import { parkingApi } from "../services/campusApi";
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

export default function Parking() {
  const [parking, setParking] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchParking = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await parkingApi.list();
      setParking(data || []);
    } catch {
      setError("Failed to load parking zones from server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await parkingApi.list();
        if (active) setParking(data || []);
      } catch {
        if (active) setError("Failed to load parking zones from server.");
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
  useSocketEvent("parking:updated", (event) => {
    setParking((prev) => {
      const exists = prev.some((p) => p.zoneId === event.zoneId);
      if (exists) {
        return prev.map((p) => (p.zoneId === event.zoneId ? { ...p, ...event } : p));
      }
      return [event, ...prev];
    });
  });

  const filteredParking = useMemo(() => {
    return parking.filter((lot) => {
      const matchesSearch =
        search === "" ||
        lot.name?.toLowerCase().includes(search.toLowerCase()) ||
        lot.zoneId?.toLowerCase().includes(search.toLowerCase()) ||
        lot.location?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || lot.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [parking, search, statusFilter]);

  const totalCapacity = parking.reduce((acc, p) => acc + (p.totalSpaces || 0), 0);
  const totalOccupied = parking.reduce((acc, p) => acc + (p.occupiedSpaces || 0), 0);
  const totalAvailable = parking.reduce((acc, p) => acc + (p.availableSpaces || 0), 0);
  const overallUtilization =
    totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parking Availability"
        description="Real-time campus parking lot capacity, bay status, and vehicle occupancy"
        icon={CarFront}
      >
        <Button
          variant="outline"
          size="sm"
          onClick={fetchParking}
          loading={loading}
          icon={RefreshCw}
        >
          Refresh Status
        </Button>
      </PageHeader>

      {error && (
        <ErrorState
          title="Parking telemetry unavailable"
          description={error}
          onRetry={fetchParking}
        />
      )}

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#806B6A]">
              Total Capacity
            </p>
            <p className="mt-1 text-2xl font-bold text-[#3C1414]">
              {loading ? "..." : totalCapacity}
            </p>
            <p className="mt-1 text-xs text-[#806B6A]">All registered campus bays</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#806B6A]">
              Available Spots
            </p>
            <p className="mt-1 text-2xl font-bold text-[#287A43]">
              {loading ? "..." : totalAvailable}
            </p>
            <p className="mt-1 text-xs text-[#806B6A]">Ready for entry</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#806B6A]">
              Occupied Bays
            </p>
            <p className="mt-1 text-2xl font-bold text-[#3C1414]">
              {loading ? "..." : totalOccupied}
            </p>
            <p className="mt-1 text-xs text-[#806B6A]">Currently parked vehicles</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#806B6A]">
              Campus Utilization
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-[#3C1414]">
                {loading ? "..." : `${overallUtilization}%`}
              </span>
              <span className="text-xs text-[#806B6A]">density</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#F6EDED]">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  overallUtilization >= 90
                    ? "bg-[#C62828]"
                    : overallUtilization >= 70
                    ? "bg-[#A66A00]"
                    : "bg-[#287A43]"
                }`}
                style={{ width: `${overallUtilization}%` }}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#806B6A]"
          />
          <input
            type="text"
            placeholder="Search lot by name, zone, or location..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-[#E5D6D6] bg-white py-2 pl-10 pr-4 text-sm text-[#3C1414] placeholder-[#806B6A] transition focus:border-[#B26262] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20"
          />
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-[#E5D6D6] bg-white p-1 text-xs overflow-x-auto no-scrollbar max-w-full">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              statusFilter === "all"
                ? "bg-[#B26262] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            All Lots ({parking.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("available")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              statusFilter === "available"
                ? "bg-[#287A43] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            Available
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("full")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              statusFilter === "full"
                ? "bg-[#C62828] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            Full
          </button>
        </div>
      </div>

      {/* Parking Lots Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      ) : filteredParking.length === 0 ? (
        <EmptyState
          title={
            search || statusFilter !== "all"
              ? "No parking lots found"
              : "No campus parking areas currently registered."
          }
          description={
            search || statusFilter !== "all"
              ? "No parking facilities match your search criteria."
              : "Parking areas added by administrators will display real-time availability here."
          }
          icon={CarFront}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredParking.map((lot) => {
            const occupancyPct =
              lot.totalSpaces > 0
                ? Math.min(100, Math.round((lot.occupiedSpaces / lot.totalSpaces) * 100))
                : 0;

            return (
              <Card
                key={lot.zoneId || lot._id}
                className="flex flex-col justify-between overflow-hidden transition hover:shadow-md"
              >
                <CardHeader className="p-5 pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{lot.name}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <MapPin size={13} className="shrink-0" />
                        <span>{lot.location}</span>
                        {lot.building && <span>• {lot.building}</span>}
                      </CardDescription>
                    </div>
                    <Badge
                      variant={
                        lot.status === "available"
                          ? "success"
                          : lot.status === "full"
                          ? "danger"
                          : "neutral"
                      }
                      dot
                    >
                      {lot.status}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="p-5 pt-0 space-y-4">
                  {/* Space Breakdown Numbers */}
                  <div className="flex items-baseline justify-between rounded-xl bg-[#F6EDED] p-3.5">
                    <div>
                      <p className="text-xs text-[#806B6A]">Available</p>
                      <p className="text-xl font-bold text-[#287A43]">
                        {lot.availableSpaces}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-[#806B6A]">Occupied / Total</p>
                      <p className="text-sm font-semibold text-[#3C1414]">
                        {lot.occupiedSpaces} / {lot.totalSpaces}
                      </p>
                    </div>
                  </div>

                  {/* Progress Meter */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-[#806B6A]">
                      <span>Occupancy Density</span>
                      <span className="font-semibold">{occupancyPct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-[#F6EDED]">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          occupancyPct >= 90
                            ? "bg-[#C62828]"
                            : occupancyPct >= 70
                            ? "bg-[#A66A00]"
                            : "bg-[#287A43]"
                        }`}
                        style={{ width: `${occupancyPct}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[#806B6A] pt-1 border-t border-[#E5D6D6]">
                    <span className="font-mono">Zone: {lot.zoneId}</span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {lot.lastUpdatedAt
                        ? new Date(lot.lastUpdatedAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "Recent"}
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
