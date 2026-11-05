import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Video, Search, RefreshCw, Smartphone } from "lucide-react";
import { cameraApi } from "../services/campusApi";
import { useSocket } from "../hooks/useSocket";
import useSocketEvent from "../hooks/useSocketEvent";
import { useAuth } from "../hooks/useAuth";
import {
  CameraGrid,
  CameraDetailModal,
  RegisterCameraModal,
} from "../features/cameras";
import {
  Button,
  PageHeader,
  ErrorState,
} from "../components/ui";

export default function Cameras() {
  const [cameras, setCameras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [registerModalOpen, setRegisterModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);

  const { user } = useAuth();
  const canManage = user?.role === "SUPER_ADMIN" || user?.role === "SECURITY";

  const { connected } = useSocket();
  const wasConnectedRef = useRef(false);
  const debounceTimerRef = useRef(null);
  const statusQueueRef = useRef(new Map());

  const fetchCameras = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await cameraApi.list();
      setCameras(data || []);
    } catch {
      setError("Failed to load camera feeds. Check backend gateway connectivity.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await cameraApi.list();
        if (active) setCameras(data || []);
      } catch {
        if (active) {
          setError("Failed to load camera feeds. Check backend gateway connectivity.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  // Reconcile missed updates through REST endpoints after reconnection (Requirement D)
  useEffect(() => {
    if (connected && wasConnectedRef.current === false) {
      // Reconnected after offline state - reconcile
      fetchCameras();
    }
    wasConnectedRef.current = connected;
  }, [connected, fetchCameras]);

  // Debounce transient camera status updates to avoid flicker (Requirement D)
  useSocketEvent("camera:status", (event) => {
    const camId = event.cameraId || event.id;
    if (!camId) return;

    // Queue update with timestamp
    statusQueueRef.current.set(camId, {
      status: event.status,
      lastHeartbeat: event.lastHeartbeat || (event.status === "online" ? new Date().toISOString() : null),
      lastSeenAt: event.lastHeartbeat || (event.status === "online" ? new Date().toISOString() : null),
    });

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Debounce rapid flapping over 250ms
    debounceTimerRef.current = setTimeout(() => {
      const queuedUpdates = new Map(statusQueueRef.current);
      statusQueueRef.current.clear();

      setCameras((prev) =>
        prev.map((c) => {
          const matchId = c.cameraId || c._id;
          if (queuedUpdates.has(matchId)) {
            const update = queuedUpdates.get(matchId);
            return {
              ...c,
              status: update.status,
              lastHeartbeat: update.lastHeartbeat || c.lastHeartbeat,
              lastSeenAt: update.lastSeenAt || c.lastSeenAt,
            };
          }
          return c;
        })
      );
    }, 250);
  });

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const filteredCameras = useMemo(() => {
    return cameras.filter((cam) => {
      const matchesSearch =
        search === "" ||
        cam.name?.toLowerCase().includes(search.toLowerCase()) ||
        cam.cameraId?.toLowerCase().includes(search.toLowerCase()) ||
        cam.location?.toLowerCase().includes(search.toLowerCase()) ||
        cam.building?.toLowerCase().includes(search.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || cam.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [cameras, search, statusFilter]);

  const onlineCount = cameras.filter((c) => c.status === "online").length;
  const offlineCount = cameras.filter((c) => c.status === "offline").length;
  const maintenanceCount = cameras.filter((c) => c.status === "maintenance").length;

  const handleInspectCamera = (camera) => {
    setSelectedCamera(camera);
    setDetailModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Camera Monitoring"
        description="Live surveillance telemetry, RTSP edge node diagnostics, and camera health"
        icon={Video}
      >
        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setEditingCamera(null);
                setRegisterModalOpen(true);
              }}
              icon={Smartphone}
            >
              Register Camera / Connect Phone
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCameras}
            loading={loading}
            icon={RefreshCw}
          >
            Refresh Feeds
          </Button>
        </div>
      </PageHeader>

      {error && (
        <ErrorState
          title="Camera feeds unavailable"
          description={error}
          onRetry={fetchCameras}
        />
      )}

      {/* Filter and Stats Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#806B6A]"
          />
          <input
            type="text"
            placeholder="Search by name, ID, or location..."
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
            All ({cameras.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("online")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              statusFilter === "online"
                ? "bg-[#287A43] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            Online ({onlineCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("offline")}
            className={`rounded-lg px-2.5 py-1 font-medium transition ${
              statusFilter === "offline"
                ? "bg-[#C62828] text-white"
                : "text-[#806B6A] hover:text-[#3C1414]"
            }`}
          >
            Offline ({offlineCount})
          </button>
          {maintenanceCount > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilter("maintenance")}
              className={`rounded-lg px-2.5 py-1 font-medium transition ${
                statusFilter === "maintenance"
                  ? "bg-[#A66A00] text-white"
                  : "text-[#806B6A] hover:text-[#3C1414]"
              }`}
            >
              Maint ({maintenanceCount})
            </button>
          )}
        </div>
      </div>

      {/* Modular Camera Grid */}
      <CameraGrid
        cameras={filteredCameras}
        loading={loading}
        onInspect={handleInspectCamera}
        onStatusChange={(id, newStatus) => {
          setCameras((prev) =>
            prev.map((c) =>
              c._id === id || c.id === id || c.cameraId === id
                ? {
                    ...c,
                    status: newStatus,
                    lastHeartbeat: new Date().toISOString(),
                    lastSeenAt: new Date().toISOString(),
                  }
                : c
            )
          );
        }}
        emptyMessage={
          search || statusFilter !== "all"
            ? "No camera feeds matched your filter criteria."
            : "No cameras registered."
        }
        onResetFilters={
          search || statusFilter !== "all"
            ? () => {
                setSearch("");
                setStatusFilter("all");
              }
            : null
        }
      />

      {/* Camera Detail & Diagnostics Modal (On-Demand Fetching) */}
      <CameraDetailModal
        camera={selectedCamera}
        isOpen={detailModalOpen}
        canManage={canManage}
        onClose={() => {
          setDetailModalOpen(false);
          setSelectedCamera(null);
        }}
        onEdit={(cam) => {
          if (!canManage) return;
          setEditingCamera(cam);
          setRegisterModalOpen(true);
        }}
        onDeleted={() => {
          fetchCameras();
          setDetailModalOpen(false);
          setSelectedCamera(null);
        }}
      />

      {/* Register / Edit Camera Modal */}
      <RegisterCameraModal
        isOpen={registerModalOpen}
        canManage={canManage}
        onClose={() => {
          setRegisterModalOpen(false);
          setEditingCamera(null);
        }}
        onRegistered={() => {
          fetchCameras();
          setEditingCamera(null);
        }}
        onDeleted={() => {
          fetchCameras();
          setRegisterModalOpen(false);
          setEditingCamera(null);
        }}
        cameraToEdit={editingCamera}
      />
    </div>
  );
}
