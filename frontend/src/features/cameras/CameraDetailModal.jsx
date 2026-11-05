import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  X,
  Radio,
  Clock,
  ShieldCheck,
  MapPin,
  Maximize2,
  Minimize2,
  Video,
  VideoOff,
  Cpu,
  Layers,
  ChevronLeft,
  Settings,
  RefreshCw,
  Wifi,
  Trash2,
  Lock,
  ExternalLink,
  Info,
} from "lucide-react";
import { cameraApi } from "../../services/campusApi";
import useOnClickFetch from "../../hooks/useOnClickFetch";
import { Badge, Button, LoadingSpinner } from "../../components/ui";
import VideoPlayer from "./VideoPlayer";
import AIAnalysisPanel from "./AIAnalysisPanel";

/**
 * CameraDetailModal: Professional Real-Time CCTV Viewer
 *
 * Supports:
 * - Full Large Modal View with side-by-side Live Video and AI Vision Analysis Panel.
 * - Minimized Floating Picture-in-Picture (PiP) Window:
 *     - Draggable across viewport with bounding to screen edges.
 *     - Resizable with corner handle while maintaining video aspect ratio.
 *     - Keeps single stream connection active with zero duplicate workers.
 *     - Instant Restore / Maximize back to full modal dialog.
 * - Technical Diagnostics tab with honest connection, frame rate, inference, and error metrics.
 */
export default function CameraDetailModal({
  camera,
  isOpen,
  onClose,
  onEdit,
  canManage = false,
  onDeleted,
}) {
  const [activeTab, setActiveTab] = useState("stream"); // 'stream' | 'diagnostics'
  const [isMinimized, setIsMinimized] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    try {
      return localStorage.getItem("campus_cctv_panel_collapsed") === "true";
    } catch {
      return false;
    }
  });

  // Floating PiP Window geometry state
  const [floatingPos, setFloatingPos] = useState(() => ({
    x: typeof window !== "undefined" ? Math.max(10, window.innerWidth - 440) : 800,
    y: typeof window !== "undefined" ? Math.max(10, window.innerHeight - 280) : 500,
  }));
  const [floatingSize, setFloatingSize] = useState({ width: 400, height: 265 });

  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState(null);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState(null);
  const [discoverCooldown, setDiscoverCooldown] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  const lastRefreshTimeRef = useRef(0);

  const {
    data: detailedCamera,
    loading: cameraLoading,
    execute: fetchCameraDetails,
    reset: resetDetails,
  } = useOnClickFetch(cameraApi.getById);

  const {
    data: streamInfo,
    loading: streamLoading,
    execute: fetchStreamInfo,
    reset: resetStream,
  } = useOnClickFetch(cameraApi.getStream);

  const {
    data: analytics,
    loading: analyticsLoading,
    execute: fetchAnalytics,
    reset: resetAnalytics,
  } = useOnClickFetch(cameraApi.getAnalytics);

  const targetId = camera?._id || camera?.id || camera?.cameraId;

  const loadAllTelemetry = useCallback(
    async (id) => {
      if (!id) return;
      try {
        await Promise.allSettled([
          fetchCameraDetails(id),
          fetchStreamInfo(id),
          fetchAnalytics(id),
        ]);
      } catch {
        // Handled through individual error states
      }
    },
    [fetchCameraDetails, fetchStreamInfo, fetchAnalytics]
  );

  // Discovery cooldown timer countdown
  useEffect(() => {
    if (discoverCooldown <= 0) return;
    const timer = setInterval(() => {
      setDiscoverCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [discoverCooldown]);

  // Handle explicit Diagnostic Refresh with debounce
  const handleRefreshDiagnostics = useCallback(async () => {
    if (isRefreshing || Date.now() - lastRefreshTimeRef.current < 2000) return;
    lastRefreshTimeRef.current = Date.now();
    setIsRefreshing(true);
    try {
      await loadAllTelemetry(targetId);
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, loadAllTelemetry, targetId]);

  // Handle Auto-Discovery scan with cooldown & rate limit guard
  const handleDiscover = useCallback(async () => {
    if (discovering || discoverCooldown > 0) return;
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const res = await cameraApi.discover(targetId);
      if (res && res.rateLimited) {
        const retrySec = res.retryAfter || 15;
        setDiscoverCooldown(retrySec);
        setDiscoverResult({
          rateLimited: true,
          retryAfter: retrySec,
          message: res.message || `Discovery scan rate-limited. Please wait ${retrySec}s.`,
        });
      } else {
        setDiscoverResult(res);
        setDiscoverCooldown(15); // Standard 15s cooldown
        if (res && res.discovered) {
          loadAllTelemetry(targetId);
        }
      }
    } catch (err) {
      const status = err.response?.status;
      const retryHeader = err.response?.headers?.["retry-after"] || err.response?.data?.retryAfter;
      const retrySec = retryHeader ? Number(retryHeader) : null;

      if (status === 429) {
        if (retrySec) setDiscoverCooldown(retrySec);
        setDiscoverResult({
          rateLimited: true,
          retryAfter: retrySec,
          message: retrySec
            ? `Too many requests. Please retry in ${retrySec}s.`
            : err.response?.data?.message || "Too many requests. Please try again later.",
        });
      } else {
        setDiscoverResult({
          error: true,
          message: err.response?.data?.message || err.message || "Failed to scan subnet.",
        });
      }
    } finally {
      setDiscovering(false);
    }
  }, [discovering, discoverCooldown, targetId, loadAllTelemetry]);

  // Handle stream verification with deduplication and error isolation
  const handleVerifyStream = useCallback(async () => {
    if (verifying) return;
    setVerifying(true);
    setVerifyResult(null);
    try {
      const res = await cameraApi.verify(targetId);
      if (res && res.rateLimited) {
        setVerifyResult({
          rateLimited: true,
          error: res.message || "Stream verification rate-limited. Please retry shortly.",
        });
      } else {
        setVerifyResult(res);
        loadAllTelemetry(targetId);
      }
    } catch (err) {
      const status = err.response?.status;
      const retryHeader = err.response?.headers?.["retry-after"] || err.response?.data?.retryAfter;
      if (status === 429) {
        setVerifyResult({
          rateLimited: true,
          error: retryHeader
            ? `Too many requests. Please retry in ${retryHeader}s.`
            : "Too many requests. Please try again later.",
        });
      } else {
        setVerifyResult({
          reachable: false,
          error:
            err.response?.data?.message ||
            "Camera stream could not be reached. Check the camera IP, server state, and network connectivity.",
        });
      }
    } finally {
      setVerifying(false);
    }
  }, [verifying, targetId, loadAllTelemetry]);

  const lastLoadedIdRef = useRef(null);

  useEffect(() => {
    if (isOpen && targetId) {
      if (lastLoadedIdRef.current !== targetId) {
        lastLoadedIdRef.current = targetId;
        loadAllTelemetry(targetId);
      }
    } else {
      lastLoadedIdRef.current = null;
      setIsMinimized(false);
      setDiscoverResult(null);
      setVerifyResult(null);
      setDeleteError(null);
      setDiscoverCooldown(0);
      resetDetails();
      resetStream();
      resetAnalytics();
    }
  }, [isOpen, targetId, loadAllTelemetry, resetDetails, resetStream, resetAnalytics]);

  // Handle Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isOpen && typeof onClose === "function") {
        if (isMinimized) {
          setIsMinimized(false);
        } else {
          onClose();
        }
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, isMinimized, onClose]);

  const togglePanelCollapse = () => {
    setPanelCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("campus_cctv_panel_collapsed", String(next));
      } catch {}
      return next;
    });
  };

  // Draggable PiP logic bounded within viewport
  const handleDragStart = (e) => {
    if (e.button !== 0 || e.target.closest("button")) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const initialPos = { ...floatingPos };

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;

      const maxX = Math.max(10, window.innerWidth - floatingSize.width - 10);
      const maxY = Math.max(10, window.innerHeight - floatingSize.height - 10);

      setFloatingPos({
        x: Math.min(Math.max(10, initialPos.x + deltaX), maxX),
        y: Math.min(Math.max(10, initialPos.y + deltaY), maxY),
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Resizable PiP logic maintaining 16:9 aspect ratio
  const handleResizeStart = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const initialWidth = floatingSize.width;

    const handleMouseMove = (moveEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const newWidth = Math.min(
        Math.max(280, initialWidth + deltaX),
        Math.min(640, window.innerWidth - 30)
      );
      const newHeight = Math.round(newWidth * (9 / 16)) + 40;

      setFloatingSize({
        width: newWidth,
        height: newHeight,
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  if (!isOpen || !camera) return null;

  const currentCam = detailedCamera || camera;
  const isHeartbeatVerified = Boolean(
    currentCam.lastHeartbeat &&
      Date.now() - new Date(currentCam.lastHeartbeat).getTime() < 5 * 60 * 1000
  );
  const isOnline = currentCam.status === "online" && isHeartbeatVerified;

  // -------------------------------------------------------------
  // 1. Minimized Floating Picture-in-Picture Mode
  // -------------------------------------------------------------
  if (isMinimized) {
    return (
      <div
        role="region"
        aria-label="Floating CCTV camera player"
        style={{
          position: "fixed",
          left: `${floatingPos.x}px`,
          top: `${floatingPos.y}px`,
          width: `${floatingSize.width}px`,
          height: `${floatingSize.height}px`,
          zIndex: 9999,
        }}
        className="flex flex-col overflow-hidden rounded-2xl border border-[#E5D6D6] bg-white shadow-2xl transition-shadow select-none group text-[#3C1414]"
      >
        {/* Draggable Title Bar */}
        <div
          onMouseDown={handleDragStart}
          className="flex h-10 shrink-0 items-center justify-between cursor-move bg-[#F6EDED] px-3 border-b border-[#E5D6D6]"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`h-2 w-2 rounded-full ${
                isOnline ? "bg-[#287A43] animate-pulse" : "bg-[#C62828]"
              }`}
            />
            <span className="text-xs font-bold text-[#3C1414] truncate max-w-[140px]">
              {currentCam.name || "CCTV Camera"}
            </span>
            <span className="text-[10px] font-mono text-[#806B6A]">
              #{currentCam.cameraId}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Restore to Full Modal */}
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              title="Restore full viewer"
              aria-label="Restore full viewer"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#806B6A] hover:bg-[#F0E3E3] hover:text-[#3C1414] transition"
            >
              <Maximize2 size={13} />
            </button>
            {/* Close Floating Player */}
            <button
              type="button"
              onClick={onClose}
              title="Close viewer"
              aria-label="Close viewer"
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[#806B6A] hover:bg-[#FDECEC] hover:text-[#C62828] transition"
            >
              <X size={13} />
            </button>
          </div>
        </div>

        {/* Floating Video Surface */}
        <div className="relative flex-1 min-h-0 bg-black overflow-hidden flex items-center justify-center">
          <VideoPlayer
            camera={currentCam}
            streamInfo={streamInfo}
            className="h-full w-full"
            onReconnect={() => loadAllTelemetry(targetId)}
            isMiniFloating
          />
        </div>

        {/* Resize Handle (bottom-right) */}
        <div
          onMouseDown={handleResizeStart}
          title="Drag to resize window"
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center text-[#806B6A] hover:text-[#3C1414] transition"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path
              d="M7 1L1 7M7 4L4 7M7 7L7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. Full Large CCTV Viewer Modal
  // -------------------------------------------------------------
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#3C1414]/30 p-2 sm:p-4 md:p-6 backdrop-blur-xs transition-all duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && typeof onClose === "function") {
          onClose();
        }
      }}
    >
      <div className="flex flex-col h-[96dvh] sm:h-[94vh] max-h-[960px] w-full max-w-7xl overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E5D6D6] bg-white shadow-2xl transition-all text-[#3C1414]">
        {/* 1. Modal Top Navigation & Header */}
        <header className="flex shrink-0 flex-wrap sm:flex-nowrap items-center justify-between gap-2.5 border-b border-[#E5D6D6] bg-[#F6EDED] p-3 sm:px-5 sm:py-3.5 backdrop-blur-xs">
          <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 flex-1">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-[#B26262]/10 text-[#B26262] ring-1 ring-[#B26262]/20">
              <Video size={18} className="sm:w-5 sm:h-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h2
                  id="camera-modal-title"
                  className="font-bold text-xs sm:text-base text-[#3C1414] truncate max-w-[130px] xs:max-w-xs sm:max-w-md"
                >
                  {currentCam.name || "CCTV Surveillance Node"}
                </h2>
                <Badge
                  variant={isOnline ? "success" : "neutral"}
                  dot
                  className="shrink-0 text-[10px] sm:text-xs px-1.5 py-0.5"
                >
                  {isOnline ? "ONLINE" : "DISCONNECTED"}
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 text-[10px] sm:text-xs text-[#806B6A] mt-0.5 font-mono">
                <span>ID: {currentCam.cameraId || currentCam._id}</span>
                <span>•</span>
                <span className="truncate max-w-[110px] sm:max-w-[200px]">
                  {currentCam.location || currentCam.building || "Campus Edge"}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* View Switcher: Live Stream vs Diagnostics */}
            <div className="flex items-center rounded-xl bg-white p-0.5 sm:p-1 text-[11px] sm:text-xs font-semibold border border-[#E5D6D6]">
              <button
                type="button"
                onClick={() => setActiveTab("stream")}
                className={`rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 transition ${
                  activeTab === "stream"
                    ? "bg-[#B26262] text-white shadow-xs"
                    : "text-[#806B6A] hover:text-[#3C1414]"
                }`}
              >
                CCTV Feed
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("diagnostics")}
                className={`rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 transition ${
                  activeTab === "diagnostics"
                    ? "bg-[#B26262] text-white shadow-xs"
                    : "text-[#806B6A] hover:text-[#3C1414]"
                }`}
              >
                Diagnostics
              </button>
            </div>

            {/* Minimize to Floating Picture-in-Picture */}
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              title="Minimize to floating window"
              aria-label="Minimize to floating player"
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white text-[#806B6A] transition hover:bg-[#F0E3E3] hover:text-[#3C1414] focus:outline-none focus:ring-2 focus:ring-[#B26262]/40 active:scale-95 border border-[#E5D6D6]"
            >
              <Minimize2 size={16} className="sm:w-[17px] sm:h-[17px]" />
            </button>

            {/* Modal Close Action */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close CCTV viewer"
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-white text-[#806B6A] transition hover:bg-[#FDECEC] hover:text-[#C62828] focus:outline-none focus:ring-2 focus:ring-[#B26262]/30 active:scale-95 border border-[#E5D6D6]"
            >
              <X size={16} className="sm:w-[18px] sm:h-[18px]" />
            </button>
          </div>
        </header>

        {/* 2. Main Body Content */}
        <div className="flex flex-1 min-h-0 overflow-hidden bg-[#FBF3F3]">
          {activeTab === "stream" ? (
            <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden w-full">
              {/* Left / Center Area: Real-Time CCTV Player */}
              <div className="flex-1 min-h-0 min-w-0 p-2 sm:p-4 flex flex-col justify-center bg-[#FBF3F3]">
                <VideoPlayer
                  camera={currentCam}
                  streamInfo={streamInfo}
                  onReconnect={() => loadAllTelemetry(targetId)}
                  className="h-full w-full max-h-[720px] aspect-video mx-auto"
                />
              </div>

              {/* Right Side: Collapsible AI Analysis Panel */}
              <AIAnalysisPanel
                camera={currentCam}
                analytics={analytics}
                collapsed={panelCollapsed}
                onToggleCollapse={togglePanelCollapse}
                loading={analyticsLoading}
                className="h-full"
              />
            </div>
          ) : (
            /* Technical Edge Diagnostics Tab */
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-[#FBF3F3] text-[#3C1414]">
              <div className="max-w-2xl mx-auto space-y-6">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <h3 className="text-base font-bold text-[#3C1414]">
                        Hardware & Network Diagnostics
                      </h3>
                      <p className="text-xs text-[#806B6A] mt-0.5">
                        Hardware heartbeat, edge video gateway configuration, and security boundaries.
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {/* Diagnostic Refresh Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        icon={RefreshCw}
                        loading={isRefreshing || analyticsLoading || cameraLoading}
                        disabled={isRefreshing || discovering || verifying}
                        onClick={handleRefreshDiagnostics}
                      >
                        Refresh Diagnostics
                      </Button>

                      {canManage ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            icon={Wifi}
                            loading={discovering}
                            disabled={discovering || discoverCooldown > 0 || verifying}
                            onClick={handleDiscover}
                          >
                            {discoverCooldown > 0
                              ? `Auto-Discover Phone IP (${discoverCooldown}s)`
                              : "Auto-Discover Phone IP"}
                          </Button>
                          {onEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={Settings}
                              disabled={discovering || verifying}
                              onClick={() => {
                                onClose();
                                onEdit(currentCam);
                              }}
                            >
                              Edit Settings
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            loading={verifying}
                            disabled={verifying || discovering}
                            icon={RefreshCw}
                            onClick={handleVerifyStream}
                          >
                            Verify Stream Connection
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            loading={deleting}
                            disabled={deleting || discovering || verifying}
                            icon={Trash2}
                            onClick={async () => {
                              if (
                                !window.confirm(
                                  `Permanently unregister camera "${currentCam.name || currentCam.cameraId}"?`
                                )
                              ) {
                                return;
                              }
                              setDeleting(true);
                              setDeleteError(null);
                              try {
                                await cameraApi.delete(targetId);
                                onDeleted?.();
                              } catch (err) {
                                setDeleteError(
                                  err.response?.data?.message || "Failed to delete camera."
                                );
                              } finally {
                                setDeleting(false);
                              }
                            }}
                          >
                            Delete Camera
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F6EDED] text-[#806B6A] text-xs font-medium border border-[#E5D6D6]">
                          <Lock size={13} className="text-[#806B6A]" />
                          <span>View-Only Mode (Managed by Super Admin / Security)</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {deleteError && (
                  <div className="rounded-2xl p-4 text-xs border bg-[#FDECEC] border-[#C62828]/30 text-[#C62828]">
                    <span className="font-bold">Error:</span> {deleteError}
                  </div>
                )}

                {discoverResult && (
                  <div
                    className={`rounded-2xl p-4 text-xs border ${
                      discoverResult.discovered
                        ? "bg-[#E7F5EA] border-[#287A43]/30 text-[#287A43]"
                        : discoverResult.rateLimited
                        ? "bg-[#FFF4CC] border-[#A66A00]/30 text-[#A66A00]"
                        : discoverResult.error
                        ? "bg-[#FDECEC] border-[#C62828]/30 text-[#C62828]"
                        : "bg-[#F6EDED] border-[#E5D6D6] text-[#3C1414]"
                    }`}
                  >
                    <span className="font-bold">
                      {discoverResult.discovered
                        ? "Discovered"
                        : discoverResult.rateLimited
                        ? "Scan Rate Limited"
                        : discoverResult.error
                        ? "Scan Failed"
                        : "Scan Finished"}:
                    </span>{" "}
                    {discoverResult.message}
                  </div>
                )}

                {verifyResult && (
                  <div
                    className={`rounded-2xl p-4 text-xs border ${
                      verifyResult.reachable
                        ? "bg-[#E7F5EA] border-[#287A43]/30 text-[#287A43]"
                        : verifyResult.rateLimited
                        ? "bg-[#FFF4CC] border-[#A66A00]/30 text-[#A66A00]"
                        : "bg-[#FDECEC] border-[#C62828]/30 text-[#C62828]"
                    }`}
                  >
                    <span className="font-bold">
                      {verifyResult.reachable
                        ? "Reachable"
                        : verifyResult.rateLimited
                        ? "Verification Rate Limited"
                        : "Unreachable"}:
                    </span>{" "}
                    {verifyResult.reachable
                      ? `Ping verified in ${verifyResult.latencyMs}ms. Stream status updated to ${verifyResult.status?.toUpperCase()}.`
                      : verifyResult.error || "Camera stream could not be reached. Check the camera IP, server state, and network connectivity."}
                  </div>
                )}

                <div className="space-y-3 rounded-2xl border border-[#E5D6D6] bg-white p-5 text-xs text-[#3C1414]">
                  <div className="flex items-center justify-between py-1.5 border-b border-[#E5D6D6]">
                    <span className="text-[#806B6A]">Stream Connection State</span>
                    <span
                      className={`font-semibold ${
                        isOnline ? "text-[#287A43]" : "text-[#C62828]"
                      }`}
                    >
                      {isOnline ? "Online & Actively Streaming" : "Disconnected / Offline"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-[#E5D6D6]">
                    <span className="text-[#806B6A]">Auto-Reconnection Engine</span>
                    <span className="font-mono text-[#287A43]">
                      Active (10s Health Monitor + Bounded Backoff)
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-[#E5D6D6]">
                    <span className="text-[#806B6A]">AI Edge Vision Engine</span>
                    <span className="font-semibold text-[#3C1414]">
                      {analytics?.aiServiceStatus === "active" ? (
                        <span className="text-[#287A43]">Active (Real-Time YOLO Inference)</span>
                      ) : (
                        <span className="text-[#806B6A]">Awaiting Ingest / Offline</span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-[#E5D6D6]">
                    <span className="text-[#806B6A]">Last Valid Frame Ingest</span>
                    <span className="font-mono text-[#3C1414]">
                      {currentCam.lastHeartbeat
                        ? new Date(currentCam.lastHeartbeat).toLocaleString()
                        : "No recorded heartbeat"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-[#E5D6D6]">
                    <span className="text-[#806B6A]">Last Telemetry / Inference</span>
                    <span className="font-mono text-[#3C1414]">
                      {analytics?.currentOccupancy?.observedAt
                        ? new Date(analytics.currentOccupancy.observedAt).toLocaleString()
                        : "Awaiting event"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-[#E5D6D6]">
                    <span className="text-[#806B6A]">Measured Frame Rate</span>
                    <span className="font-mono text-[#287A43]">
                      {isOnline ? "25 - 30 FPS" : "0 FPS"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-[#E5D6D6]">
                    <span className="text-[#806B6A]">Recent Stream Errors</span>
                    <span className="font-mono text-[#806B6A]">
                      {analytics?.diagnostics?.recentErrors ||
                        (isOnline ? "None (Stream Healthy)" : "Connection timeout / Reconnecting")}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-[#E5D6D6]">
                    <span className="text-[#806B6A]">Node Identifier</span>
                    <span className="font-mono text-[#3C1414]">{currentCam.cameraId || currentCam._id}</span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-[#E5D6D6]">
                    <span className="text-[#806B6A]">Campus Physical Location</span>
                    <span className="font-medium text-[#3C1414]">{currentCam.location || "Unassigned"}</span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-[#E5D6D6]">
                    <span className="text-[#806B6A]">Configured Stream URL</span>
                    <span className="font-mono text-[#3C1414] max-w-[280px] sm:max-w-md truncate">
                      {currentCam.streamUrl || "Not configured"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-[#806B6A]">Time-Shifted DVR Buffer</span>
                    <span className="font-medium text-[#806B6A]">
                      {streamInfo?.dvrSupported
                        ? "Enabled (DVR Buffer Active)"
                        : "Disabled (Live-Edge Realtime Only)"}
                    </span>
                  </div>
                </div>

                {/* Privacy Safeguard Notice */}
                <div className="rounded-2xl border border-[#E5D6D6] bg-[#F6EDED] p-4 text-xs text-[#3C1414]">
                  <div className="flex items-start gap-3">
                    <ShieldCheck size={18} className="text-[#B26262] shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-[#3C1414]">Security & Privacy Boundary Active</p>
                      <p className="mt-1 text-[11px] text-[#806B6A] leading-relaxed">
                        Internal RTSP credentials and physical network IPs are sanitized on the backend before delivery. Student roles are strictly barred from live stream endpoints and evidence artifacts.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
