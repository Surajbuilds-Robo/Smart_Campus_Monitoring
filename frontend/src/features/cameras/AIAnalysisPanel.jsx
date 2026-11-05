import { useState, useEffect, useMemo } from "react";
import {
  Users,
  Activity,
  MapPin,
  Video,
  Clock,
  TrendingUp,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  ArrowDown,
  Minus,
  CheckCircle2,
  AlertCircle,
  Shield,
  ExternalLink,
} from "lucide-react";
import useSocketEvent from "../../hooks/useSocketEvent";
import { formatRelativeTime } from "../../utils/time";

/**
 * AI Vision Analysis Panel
 *
 * Backed 100% by genuine YOLO detections and MongoDB observations.
 * Displays pipeline health, 4 core metric cards, a 30-minute trend graph,
 * and recent real detections with confidence scores.
 */
export default function AIAnalysisPanel({
  camera,
  analytics,
  collapsed,
  onToggleCollapse,
  loading = false,
  className = "",
}) {
  const [liveOccupancy, setLiveOccupancy] = useState(analytics?.currentOccupancy || null);
  const [liveIncidents, setLiveIncidents] = useState(analytics?.activeIncidents || []);
  const [pipelineStatus, setPipelineStatus] = useState(
    analytics?.pipelineStatus || (analytics?.aiServiceStatus === "active" ? "processing" : "connected")
  );
  const [trendDelta, setTrendDelta] = useState(analytics?.trendDelta || 0);
  const [history, setHistory] = useState(analytics?.history || []);
  const [recentDetections, setRecentDetections] = useState(analytics?.recentDetections || []);
  const [lastDetection, setLastDetection] = useState(analytics?.lastDetectionAt || null);

  // Sync state whenever camera or initial analytics change
  useEffect(() => {
    setLiveOccupancy(analytics?.currentOccupancy || null);
    setLiveIncidents(analytics?.activeIncidents || []);
    setPipelineStatus(
      analytics?.pipelineStatus ||
        (analytics?.aiServiceStatus === "active"
          ? "processing"
          : camera?.status === "online"
          ? "connected"
          : "disconnected")
    );
    setTrendDelta(analytics?.trendDelta || 0);
    setHistory(analytics?.history || []);
    setRecentDetections(analytics?.recentDetections || []);
    setLastDetection(analytics?.lastDetectionAt || null);
  }, [camera?.cameraId, camera?._id, camera?.status, analytics]);

  // Real-time Socket Event: occupancy / detection update for this specific camera
  useSocketEvent("occupancy:updated", (event) => {
    if (!event || !camera) return;
    const match =
      (camera.cameraId && event.cameraId === camera.cameraId) ||
      (camera._id && event.camera === camera._id) ||
      (camera._id && event.cameraId === camera._id) ||
      (camera.cameraId && event.camera === camera.cameraId);

    if (match) {
      setLiveOccupancy(event);
      setPipelineStatus("processing");
      const eventTime = event.observedAt || new Date().toISOString();
      setLastDetection(eventTime);

      // Update history with new data point
      const newPoint = {
        timestamp: eventTime,
        peopleCount: event.peopleCount ?? 0,
        occupancyRatio: event.occupancyRatio,
      };

      setHistory((prev) => {
        const updated = [...prev, newPoint];
        // Calculate trend delta against previous data point
        if (prev.length > 0) {
          const prevCount = prev[prev.length - 1].peopleCount ?? 0;
          setTrendDelta((event.peopleCount ?? 0) - prevCount);
        }
        return updated.slice(-60); // keep last 60 points
      });

      // If event contains detections or detected people, prepend to recent detections list
      if (event.peopleCount > 0) {
        const newDetection = {
          label: "Person detected",
          confidence: event.confidence != null ? Number(event.confidence.toFixed(2)) : null,
          timestamp: eventTime,
          isLive: true,
        };
        setRecentDetections((prev) => [newDetection, ...prev.slice(0, 9)]);
      }
    }
  });

  // Real-time camera status update
  useSocketEvent("camera:status", (event) => {
    if (!event || !camera) return;
    if (event.cameraId === camera.cameraId || event._id === camera._id) {
      if (event.status === "offline") {
        setPipelineStatus("disconnected");
      } else if (event.status === "online" && pipelineStatus === "disconnected") {
        setPipelineStatus("connected");
      }
    }
  });

  // Real-time Incident created
  useSocketEvent("incident:created", (event) => {
    if (!event || !camera) return;
    if (event.cameraId === camera.cameraId || event.camera === camera._id) {
      setLiveIncidents((prev) => [event, ...prev]);
    }
  });

  const [selectedRange, setSelectedRange] = useState("30m"); // '15m' | '30m' | '1h' | '24h'

  const peopleCount = liveOccupancy?.peopleCount ?? 0;
  const rawCapacity = liveOccupancy?.capacity || camera?.capacity || null;
  const capacity = rawCapacity && rawCapacity > 0 ? rawCapacity : null;
  const occupancyPct =
    capacity && liveOccupancy?.peopleCount != null
      ? Math.min(100, Math.round((peopleCount / capacity) * 100))
      : null;

  const isConnected = camera?.status === "online" || pipelineStatus !== "disconnected";
  const isProcessing = pipelineStatus === "processing";

  // Filter history based on selected time range
  const filteredHistory = useMemo(() => {
    if (!history || history.length === 0) return [];
    let cutoffMs = 30 * 60 * 1000;
    if (selectedRange === "15m") cutoffMs = 15 * 60 * 1000;
    else if (selectedRange === "1h") cutoffMs = 60 * 60 * 1000;
    else if (selectedRange === "24h") cutoffMs = 24 * 60 * 60 * 1000;

    const cutoff = Date.now() - cutoffMs;
    const records = history.filter((h) => new Date(h.timestamp).getTime() >= cutoff);
    return records.length >= 2 ? records : history;
  }, [history, selectedRange]);

  // Build SVG Points for the People Count Trend Chart
  const chartPoints = useMemo(() => {
    if (!filteredHistory || filteredHistory.length < 2) return null;

    const width = 340;
    const height = 90;
    const padding = { top: 10, bottom: 20, left: 25, right: 15 };

    const maxCount = Math.max(10, ...filteredHistory.map((h) => h.peopleCount || 0));
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    const points = filteredHistory.map((pt, idx) => {
      const x = padding.left + (idx / (filteredHistory.length - 1)) * innerWidth;
      const count = pt.peopleCount || 0;
      const y = padding.top + innerHeight - (count / maxCount) * innerHeight;
      return { x, y, count, timestamp: pt.timestamp };
    });

    const linePath = points.reduce((acc, curr, idx) => {
      return idx === 0 ? `M ${curr.x} ${curr.y}` : `${acc} L ${curr.x} ${curr.y}`;
    }, "");

    const areaPath = `${linePath} L ${points[points.length - 1].x} ${
      padding.top + innerHeight
    } L ${points[0].x} ${padding.top + innerHeight} Z`;

    // Timestamp labels
    const startTime = new Date(filteredHistory[0].timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    const midTime = new Date(
      filteredHistory[Math.floor(filteredHistory.length / 2)].timestamp
    ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const endTime = new Date(
      filteredHistory[filteredHistory.length - 1].timestamp
    ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    return {
      linePath,
      areaPath,
      points,
      labels: [startTime, midTime, endTime],
      yMax: maxCount,
    };
  }, [filteredHistory]);

  // Collapsed Sidebar Bar
  if (collapsed) {
    return (
      <aside
        aria-label="Expand AI analysis panel"
        className={`flex flex-row lg:flex-col items-center justify-between border-t lg:border-t-0 lg:border-l border-[#E5D6D6] bg-white px-4 py-2.5 lg:px-0 lg:py-4 transition-all duration-300 w-full lg:w-12 shrink-0 ${className}`}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Open AI Analysis Panel"
          aria-label="Open AI Analysis Panel"
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F6EDED] text-[#806B6A] shadow-xs ring-1 ring-[#E5D6D6] transition hover:bg-[#F0E3E3] hover:text-[#B26262]"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="hidden lg:flex flex-col items-center gap-4 py-8">
          <span
            className="rotate-90 whitespace-nowrap text-[10px] font-bold tracking-wider uppercase text-[#806B6A]"
            style={{ transformOrigin: "center" }}
          >
            AI Vision Analysis
          </span>

          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isProcessing
                ? "bg-[#287A43] animate-pulse"
                : isConnected
                ? "bg-[#B26262]"
                : "bg-[#76808D]"
            }`}
            title={pipelineStatus}
          />
        </div>

        <div className="hidden lg:flex h-8 w-8 items-center justify-center text-[#806B6A]">
          <Activity size={16} />
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Real-time AI Vision Analysis Panel"
      className={`flex flex-col border-t lg:border-t-0 lg:border-l border-[#E5D6D6] bg-white text-[#3C1414] transition-all duration-300 w-full max-h-[42vh] lg:max-h-none lg:w-[420px] xl:w-[450px] shrink-0 overflow-y-auto ${className}`}
    >
      {/* 1. Header with Pipeline Health Pill */}
      <div className="flex items-center justify-between border-b border-[#E5D6D6] bg-[#F6EDED] p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#B26262]/10 text-[#B26262]">
            <Activity size={18} />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#3C1414]">
              AI Vision Analysis
            </h3>
            <p className="text-[11px] text-[#806B6A] font-mono">
              CAM: {camera?.cameraId || "CAM-01"} • {camera?.name || "CCTV"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Pill */}
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
              isProcessing
                ? "bg-[#E7F5EA] text-[#287A43] border border-[#287A43]/30"
                : isConnected
                ? "bg-[#F6EDED] text-[#B26262] border border-[#B26262]/30"
                : "bg-[#F0E3E3] text-[#806B6A] border border-[#E5D6D6]"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isProcessing
                  ? "bg-[#287A43] animate-pulse"
                  : isConnected
                  ? "bg-[#B26262]"
                  : "bg-[#76808D]"
              }`}
            />
            <span className="capitalize">{pipelineStatus}</span>
            <ChevronRight size={13} className="opacity-60" />
          </div>

          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse Panel"
            aria-label="Collapse AI Panel"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-[#806B6A] transition hover:bg-[#F0E3E3] hover:text-[#3C1414]"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 p-4 text-xs">
        {/* Offline notice when edge worker is not processing */}
        {!isProcessing && (
          <div className="flex items-center gap-2 rounded-xl border border-[#A66A00]/30 bg-[#FFF4CC] p-3 text-[11px] text-[#A66A00]">
            <AlertCircle size={14} className="text-[#A66A00] shrink-0" />
            <div>
              <p className="font-semibold text-[#A66A00]">AI analysis unavailable</p>
              <p className="mt-0.5 text-[10px] text-[#A66A00]/90">
                Inference telemetry will populate automatically when the AI service ingests camera frames.
              </p>
            </div>
          </div>
        )}
        {/* 2. Four Core Detection Metric Cards (2x2 Grid) */}
        <div className="grid grid-cols-2 gap-3">
          {/* Card 1: People Count */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-[#FBF3F3] p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#B26262]/10 text-[#B26262]">
                <Users size={15} />
              </div>
              <span className="text-[11px] font-medium text-[#806B6A]">
                People Count
              </span>
            </div>

            <div className="mt-2.5">
              <span className="text-2xl font-bold tracking-tight text-[#3C1414]">
                {peopleCount}
              </span>

              <div className="mt-1 flex items-center gap-1 text-[11px] font-medium">
                {trendDelta > 0 ? (
                  <span className="flex items-center text-[#287A43]">
                    <ArrowUp size={12} className="mr-0.5" />
                    +{trendDelta} vs last minute
                  </span>
                ) : trendDelta < 0 ? (
                  <span className="flex items-center text-[#A66A00]">
                    <ArrowDown size={12} className="mr-0.5" />
                    {trendDelta} vs last minute
                  </span>
                ) : (
                  <span className="flex items-center text-[#806B6A]">
                    <Minus size={12} className="mr-0.5" />
                    Stable vs last minute
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] text-[#806B6A] font-mono">
                {lastDetection
                  ? `Observed: ${new Date(lastDetection).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                  : "Awaiting event"}
              </p>
            </div>
          </div>

          {/* Card 2: Occupancy */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-[#FBF3F3] p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#8C8C7C]/15 text-[#8C8C7C]">
                <Shield size={15} />
              </div>
              <span className="text-[11px] font-medium text-[#806B6A]">
                Occupancy
              </span>
            </div>

            <div className="mt-2.5">
              {occupancyPct != null ? (
                <>
                  <span className="text-2xl font-bold tracking-tight text-[#3C1414]">
                    {occupancyPct}%
                  </span>

                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E5D6D6]">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        occupancyPct >= 90
                          ? "bg-[#C62828]"
                          : occupancyPct >= 75
                          ? "bg-[#A66A00]"
                          : "bg-[#B26262]"
                      }`}
                      style={{ width: `${Math.min(100, occupancyPct)}%` }}
                    />
                  </div>

                  <p className="mt-1 text-right text-[10px] text-[#806B6A] font-mono">
                    {peopleCount} / {capacity} capacity
                  </p>
                </>
              ) : (
                <div className="py-1">
                  <p className="text-xs font-semibold text-[#806B6A]">
                    Capacity not configured
                  </p>
                  <p className="mt-0.5 text-[10px] text-[#806B6A]/80">
                    Configure zone capacity in camera settings.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Card 3: Zone */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-[#FBF3F3] p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#76808D]/15 text-[#76808D]">
                <MapPin size={15} />
              </div>
              <span className="text-[11px] font-medium text-[#806B6A]">
                Zone
              </span>
            </div>

            <div className="mt-2.5">
              <p className="text-sm font-bold text-[#3C1414] truncate">
                {liveOccupancy?.zoneName || camera?.location || "Main Hall"}
              </p>
              <p className="mt-0.5 text-[11px] text-[#806B6A] truncate font-mono">
                {camera?.building || camera?.location || "Campus Sector"}
              </p>
            </div>
          </div>

          {/* Card 4: Camera Status */}
          <div className="flex flex-col justify-between rounded-2xl border border-[#E5D6D6] bg-[#FBF3F3] p-3.5">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#287A43]/10 text-[#287A43]">
                <Video size={15} />
              </div>
              <span className="text-[11px] font-medium text-[#806B6A]">
                Camera Status
              </span>
            </div>

            <div className="mt-2.5">
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isConnected ? "bg-[#287A43]" : "bg-[#C62828]"
                  }`}
                />
                <span className="text-sm font-bold text-[#3C1414]">
                  {isConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-[#806B6A] truncate">
                {isProcessing
                  ? "Receiving and analyzing frames"
                  : isConnected
                  ? "Stream connected — awaiting inference"
                  : "Feed offline"}
              </p>
            </div>
          </div>
        </div>

        {/* 3. People Count Trend (Last 30 minutes) */}
        <div className="rounded-2xl border border-[#E5D6D6] bg-[#FBF3F3] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-[#B26262]" />
              <h4 className="text-xs font-bold text-[#3C1414]">
                People Count Trend
              </h4>
            </div>

            {/* Time range switcher */}
            <div className="flex items-center gap-1 rounded-lg bg-white p-0.5 border border-[#E5D6D6]">
              {["15m", "30m", "1h", "24h"].map((rng) => (
                <button
                  key={rng}
                  type="button"
                  onClick={() => setSelectedRange(rng)}
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold transition ${
                    selectedRange === rng
                      ? "bg-[#B26262] text-white shadow-2xs"
                      : "text-[#806B6A] hover:text-[#3C1414]"
                  }`}
                >
                  {rng}
                </button>
              ))}
            </div>
          </div>

          {chartPoints ? (
            <div className="w-full">
              <svg
                viewBox="0 0 340 90"
                className="w-full h-24 overflow-visible"
                preserveAspectRatio="none"
              >
                <defs>
                  <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#B26262" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#B26262" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y Axis Reference Grid Lines */}
                <line
                  x1="25"
                  y1="10"
                  x2="325"
                  y2="10"
                  stroke="#E5D6D6"
                  strokeDasharray="2 2"
                />
                <line
                  x1="25"
                  y1="40"
                  x2="325"
                  y2="40"
                  stroke="#E5D6D6"
                  strokeDasharray="2 2"
                />
                <line
                  x1="25"
                  y1="70"
                  x2="325"
                  y2="70"
                  stroke="#E5D6D6"
                />

                {/* Y Axis labels */}
                <text x="5" y="14" className="text-[9px] fill-[#806B6A] font-mono">
                  {chartPoints.yMax}
                </text>
                <text x="5" y="44" className="text-[9px] fill-[#806B6A] font-mono">
                  {Math.round(chartPoints.yMax / 2)}
                </text>
                <text x="12" y="74" className="text-[9px] fill-[#806B6A] font-mono">
                  0
                </text>

                {/* Filled Area */}
                <path d={chartPoints.areaPath} fill="url(#trendGradient)" />

                {/* Area Outline Line */}
                <path
                  d={chartPoints.linePath}
                  fill="none"
                  stroke="#B26262"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data Points */}
                {chartPoints.points.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r={i === chartPoints.points.length - 1 ? "3.5" : "2"}
                    className={
                      i === chartPoints.points.length - 1
                        ? "fill-[#B26262] stroke-white stroke-2 animate-pulse"
                        : "fill-[#8C8C7C]"
                    }
                  />
                ))}
              </svg>

              {/* X Axis Timestamps */}
              <div className="mt-1 flex items-center justify-between text-[10px] text-[#806B6A] font-mono px-3">
                <span>{chartPoints.labels[0]}</span>
                <span>{chartPoints.labels[1]}</span>
                <span>{chartPoints.labels[2]}</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center text-[#806B6A]">
              <Clock size={20} className="mb-1.5 opacity-50 text-[#8C8C7C]" />
              <p className="text-[11px] font-medium text-[#806B6A]">
                Accumulating telemetry observations
              </p>
              <p className="text-[10px] text-[#806B6A]/80 mt-0.5">
                Real-time chart will plot as vision inferences persist over time.
              </p>
            </div>
          )}
        </div>

        {/* 4. Recent Detections */}
        <div className="rounded-2xl border border-[#E5D6D6] bg-[#FBF3F3] p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-[#806B6A]" />
              <h4 className="text-xs font-bold text-[#3C1414]">
                Recent Detections
              </h4>
            </div>
            <span className="text-[11px] font-semibold text-[#B26262] hover:underline cursor-pointer flex items-center gap-0.5">
              <span>View All</span>
              <ChevronRight size={12} />
            </span>
          </div>

          {recentDetections.length > 0 ? (
            <div className="space-y-2">
              {recentDetections.slice(0, 4).map((det, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-xl bg-white p-2.5 border border-[#E5D6D6]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#B26262]/10 text-[#B26262]">
                      <Users size={15} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#3C1414]">
                        {det.label || "Person detected"}
                      </p>
                      <p className="text-[10px] text-[#806B6A] font-mono">
                        Confidence:{" "}
                        {det.confidence != null
                          ? typeof det.confidence === "number"
                            ? det.confidence.toFixed(2)
                            : det.confidence
                          : "N/A"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#806B6A] font-mono">
                      {det.timestamp
                        ? new Date(det.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })
                        : "Just now"}
                    </span>
                    <span className="rounded-md bg-[#E7F5EA] border border-[#287A43]/30 px-2 py-0.5 text-[10px] font-bold text-[#287A43]">
                      Live
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-4 text-center text-[11px] text-[#806B6A]">
              Awaiting person detection events from edge worker.
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
