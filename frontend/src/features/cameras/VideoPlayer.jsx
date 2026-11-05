import { useState, useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
  Radio,
  Settings2,
  AlertCircle,
  WifiOff,
  Sliders,
  SkipBack,
  SkipForward,
  Scan,
  Info,
} from "lucide-react";

/**
 * Professional real-time CCTV video player supporting genuine camera streams:
 * - HLS (.m3u8) via hls.js with native Safari fallback
 * - Direct HTML5 video (MP4, WebM, live HTTP streams)
 * - MJPEG streams
 * - Honest live-edge states with zero fake timelines or simulated seek buffers.
 */
export default function VideoPlayer({
  camera,
  streamInfo,
  onReconnect,
  className = "",
  autoPlay = true,
  muted: initialMuted = true,
  isMiniFloating = false,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const retryTimerRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [volume, setVolume] = useState(0.8);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [streamStatus, setStreamStatus] = useState("connecting"); // 'connecting' | 'live' | 'buffering' | 'disconnected'
  const [errorMessage, setErrorMessage] = useState(null);
  const [selectedQuality, setSelectedQuality] = useState("auto");
  const [availableQualities, setAvailableQualities] = useState(["720p"]);
  const [retryCount, setRetryCount] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);
  const imgRef = useRef(null);

  const streamUrl = streamInfo?.streamUrl || camera?.streamUrl || "";
  const isCameraOnline = camera?.status === "online" || streamInfo?.status === "online";
  const dvrSupported = Boolean(streamInfo?.dvrSupported || camera?.dvrSupported);

  const isMjpeg =
    streamInfo?.streamType === "mjpeg" ||
    streamUrl.includes("/video") ||
    streamUrl.includes("/shot.jpg") ||
    Boolean(streamInfo?.proxyUrl && streamInfo?.streamType === "mjpeg");

  const [mjpegSrc, setMjpegSrc] = useState("");
  const [usingProxy, setUsingProxy] = useState(false);
  const [feedMode, setFeedMode] = useState("annotated"); // 'annotated' | 'raw'
  const [fitMode, setFitMode] = useState("contain"); // 'contain' | 'cover'
  const [unsupportedNotice, setUnsupportedNotice] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Live timestamp clock ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const showNotice = (msg) => {
    setUnsupportedNotice(msg);
    setTimeout(() => setUnsupportedNotice(null), 3500);
  };

  // Initialize and attach genuine camera stream
  const setupStream = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (!streamUrl || !isCameraOnline) {
      setStreamStatus("disconnected");
      setErrorMessage("Camera disconnected — footage unavailable");
      setIsLive(false);
      return;
    }

    setStreamStatus("connecting");
    setErrorMessage(null);

    // MJPEG Phone Camera Stream handling (e.g. Android IP Webcam / iOS IP Camera)
    if (isMjpeg) {
      const ticket = streamInfo?.streamTicket;
      const ticketQuery = ticket ? `ticket=${encodeURIComponent(ticket)}` : "";
      const baseAnnotated = `/api/v1/cameras/${camera?._id || camera?.id}/annotated-stream`;
      const baseProxy = streamInfo?.proxyUrl || `/api/v1/cameras/${camera?._id || camera?.id}/stream-proxy`;

      const activeSrc =
        feedMode === "annotated"
          ? (streamInfo?.annotatedProxyUrl || (ticketQuery ? `${baseAnnotated}?${ticketQuery}` : baseAnnotated))
          : usingProxy
          ? (streamInfo?.proxyUrl || (ticketQuery ? `${baseProxy}?${ticketQuery}` : baseProxy))
          : streamUrl;
      setMjpegSrc(activeSrc);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const isHls =
      streamUrl.includes(".m3u8") ||
      streamInfo?.streamType === "hls" ||
      video.canPlayType("application/vnd.apple.mpegurl");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 0,
        maxBufferLength: 8,
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 4,
      });

      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        if (data.levels && data.levels.length > 0) {
          const qualities = data.levels.map((lvl) => `${lvl.height}p`);
          setAvailableQualities(["auto", ...new Set(qualities)]);
        }
        if (autoPlay) {
          video.play().catch(() => {
            // Autoplay with audio may be blocked by browser policy; retry muted
            video.muted = true;
            setIsMuted(true);
            video.play().catch(() => {});
          });
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        if (hls.levels && hls.levels[data.level]) {
          const height = hls.levels[data.level].height;
          if (selectedQuality === "auto") {
            // Auto quality adaptive selection
          }
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              setStreamStatus("disconnected");
              setErrorMessage("Network interrupted — recovering stream...");
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              setStreamStatus("buffering");
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              setStreamStatus("disconnected");
              setErrorMessage("Camera disconnected — footage unavailable");
              break;
          }
        }
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      // Native HLS for Safari / iOS
      video.src = streamUrl;
      video.load();
      if (autoPlay) {
        video.play().catch(() => {});
      }
    } else {
      // Standard MP4 / WebM / live HTTP video stream
      video.src = streamUrl;
      video.load();
      if (autoPlay) {
        video.play().catch(() => {});
      }
    }
  }, [streamUrl, isCameraOnline, streamInfo?.streamType, autoPlay, selectedQuality]);

  useEffect(() => {
    setupStream();

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [setupStream]);

  // Video element event listeners
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlaying = () => {
      setIsPlaying(true);
      setIsPaused(false);
      setStreamStatus("live");
      setIsLive(true);
      setErrorMessage(null);
      setRetryCount(0);
    };

    const handlePause = () => {
      setIsPlaying(false);
      setIsPaused(true);
    };

    const handleWaiting = () => {
      setStreamStatus("buffering");
    };

    const handleError = () => {
      setIsPlaying(false);
      setIsLive(false);
      setStreamStatus("disconnected");
      setErrorMessage("Camera disconnected — footage unavailable");
    };

    video.addEventListener("playing", handlePlaying);
    video.addEventListener("pause", handlePause);
    video.addEventListener("waiting", handleWaiting);
    video.addEventListener("error", handleError);

    return () => {
      video.removeEventListener("playing", handlePlaying);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("waiting", handleWaiting);
      video.removeEventListener("error", handleError);
    };
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  // Controls auto-hide on inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (isPlaying && !isPaused) {
        setShowControls(false);
      }
    }, 3500);
  };

  const togglePlay = () => {
    if (isMjpeg) {
      if (!isPaused) {
        setIsPaused(true);
      } else {
        setIsPaused(false);
        const ticket = streamInfo?.streamTicket;
        const ticketQuery = ticket ? `ticket=${encodeURIComponent(ticket)}&` : "";
        const base = usingProxy
          ? (streamInfo?.proxyUrl || `/api/v1/cameras/${camera?._id || camera?.id}/stream-proxy`)
          : streamUrl;
        setMjpegSrc(base + (base.includes("?") ? "&" : "?") + ticketQuery + "t=" + Date.now());
      }
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    if (isMjpeg) {
      showNotice("Audio track unavailable on live MJPEG camera feed.");
      setIsMuted((prev) => !prev);
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const nextMuted = !video.muted;
    video.muted = nextMuted;
    setIsMuted(nextMuted);
    if (!nextMuted && volume === 0) {
      setVolume(0.5);
      video.volume = 0.5;
    }
  };

  // Keyboard shortcut accessibility
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        toggleMute();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleVolumeChange = (e) => {
    const nextVolume = parseFloat(e.target.value);
    setVolume(nextVolume);
    const video = videoRef.current;
    if (video) {
      video.volume = nextVolume;
      video.muted = nextVolume === 0;
      setIsMuted(nextVolume === 0);
    }
  };

  const toggleFullscreen = () => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  // Return to live edge
  const handleGoLive = () => {
    setIsPaused(false);
    if (isMjpeg) {
      const base = usingProxy
        ? (streamInfo?.proxyUrl || `/api/v1/cameras/${camera?._id || camera?.id}/stream-proxy`)
        : streamUrl;
      setMjpegSrc(base + (base.includes("?") ? "&" : "?") + "t=" + Date.now());
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.liveSyncPosition && (video.currentTime = hlsRef.current.liveSyncPosition);
    } else if (video.seekable.length > 0) {
      video.currentTime = video.seekable.end(video.seekable.length - 1);
    }

    if (video.paused) {
      video.play().catch(() => {});
    }
  };

  // Manual reconnect with bounded retry count
  const handleManualReconnect = () => {
    if (retryCount >= 5) {
      setErrorMessage("Maximum reconnect attempts reached. Check camera edge gateway.");
      return;
    }

    setRetryCount((prev) => prev + 1);
    setStreamStatus("connecting");
    setErrorMessage("Reconnecting to camera feed...");
    setupStream();
    onReconnect?.();
  };

  // Quality switch handler
  const handleQualityChange = (quality) => {
    setSelectedQuality(quality);
    if (!hlsRef.current) return;

    if (quality === "auto") {
      hlsRef.current.currentLevel = -1;
    } else {
      const height = parseInt(quality, 10);
      const levelIdx = hlsRef.current.levels.findIndex((lvl) => lvl.height === height);
      if (levelIdx !== -1) {
        hlsRef.current.currentLevel = levelIdx;
      }
    }
  };

  const isStreamUnavailable = !streamUrl || streamStatus === "disconnected" || !isCameraOnline;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className={`relative flex flex-col justify-center overflow-hidden rounded-2xl bg-black select-none ${className}`}
    >
      {/* Video Surface / MJPEG Surface */}
      {isMjpeg ? (
        <div className="relative h-full w-full flex items-center justify-center bg-black overflow-hidden">
          {mjpegSrc && !isStreamUnavailable ? (
            <img
              ref={imgRef}
              src={mjpegSrc}
              onLoad={() => {
                setIsPlaying(true);
                setIsLive(true);
                setStreamStatus("live");
                setErrorMessage(null);
                setRetryCount(0);
              }}
              onError={() => {
                if (feedMode === "annotated") {
                  setFeedMode("raw");
                  const ticket = streamInfo?.streamTicket;
                  const ticketQuery = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
                  const rawProxy = streamInfo?.proxyUrl || `/api/v1/cameras/${camera?._id || camera?.id}/stream-proxy${ticketQuery}`;
                  setMjpegSrc(rawProxy);
                } else if (!usingProxy && (streamInfo?.proxyUrl || camera?._id || camera?.id)) {
                  setUsingProxy(true);
                  const ticket = streamInfo?.streamTicket;
                  const ticketQuery = ticket ? `?ticket=${encodeURIComponent(ticket)}` : "";
                  const rawProxy = streamInfo?.proxyUrl || `/api/v1/cameras/${camera?._id || camera?.id}/stream-proxy${ticketQuery}`;
                  setMjpegSrc(rawProxy);
                } else {
                  setIsPlaying(false);
                  setIsLive(false);
                  setStreamStatus("disconnected");
                  setErrorMessage("Camera disconnected — footage unavailable");
                }
              }}
              className={`h-full w-full ${
                fitMode === "cover" ? "object-cover" : "object-contain"
              }`}
              alt={`Live stream from ${camera?.name || "camera"}`}
            />
          ) : null}
        </div>
      ) : (
        <video
          ref={videoRef}
          playsInline
          muted={isMuted}
          className={`h-full w-full ${
            fitMode === "cover" ? "object-cover" : "object-contain"
          }`}
          aria-label={`Live stream from ${camera?.name || "camera"}`}
        />
      )}

      {/* Disconnected / Stream Unavailable Overlay */}
      {isStreamUnavailable && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-slate-950 p-6 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-slate-400 ring-1 ring-slate-800">
            <WifiOff size={28} className="text-amber-500" />
          </div>

          <h3 className="mt-3.5 text-sm font-bold text-slate-200">
            Camera disconnected — footage unavailable
          </h3>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            {errorMessage ||
              (isCameraOnline
                ? "Edge node is registered but no active live stream URL is provisioned."
                : "Camera is currently offline or unreachable over the campus network.")}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleManualReconnect}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B26262] px-4 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#9E5252] active:scale-95"
            >
              <RotateCcw size={14} />
              <span>Retry Connection</span>
            </button>
            {isMjpeg && (streamInfo?.proxyUrl || camera?._id) && !usingProxy && (
              <button
                type="button"
                onClick={() => {
                  setUsingProxy(true);
                  setMjpegSrc(streamInfo?.proxyUrl || `/api/v1/cameras/${camera?._id || camera?.id}/stream-proxy`);
                  setStreamStatus("connecting");
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700 active:scale-95"
              >
                <span>Use Gateway Proxy</span>
              </button>
            )}
          </div>

          <div className="mt-4 font-mono text-[11px] text-slate-500 flex flex-wrap items-center justify-center gap-2">
            <span>CAM: {camera?.cameraId || camera?._id || "UNKNOWN"}</span>
            <span>•</span>
            <span>STATUS: {camera?.status?.toUpperCase() || "OFFLINE"}</span>
            {camera?.lastHeartbeat && (
              <>
                <span>•</span>
                <span>LAST SEEN: {new Date(camera.lastHeartbeat).toLocaleTimeString()}</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Buffering Indicator */}
      {streamStatus === "buffering" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/40 backdrop-blur-xs">
          <div className="flex items-center gap-2 rounded-xl bg-slate-900/90 px-4 py-2 text-xs font-semibold text-white shadow-lg">
            <span className="h-2 w-2 animate-ping rounded-full bg-[#B26262]" />
            <span>Buffering live edge...</span>
          </div>
        </div>
      )}

      {/* Paused Local Notice */}
      {isPaused && isLive && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 rounded-lg bg-amber-950/90 border border-amber-800/80 px-3 py-1.5 text-xs font-medium text-amber-200 shadow-md">
          <AlertCircle size={14} className="text-amber-400 shrink-0" />
          <span>Playback paused locally — camera is still live</span>
          <button
            type="button"
            onClick={handleGoLive}
            className="ml-2 underline font-semibold hover:text-white"
          >
            Go Live
          </button>
        </div>
      )}

      {/* Player Top Overlay Strip */}
      <div
        className={`absolute top-0 inset-x-0 z-20 flex flex-wrap items-center justify-between gap-2 bg-gradient-to-b from-black/80 via-black/40 to-transparent p-2.5 sm:p-4 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {/* Live Edge Badge */}
          {isLive && !isPaused ? (
            <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-xs">
              <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
              <span>LIVE</span>
            </div>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5 rounded-md bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              <span>{isPaused ? "PAUSED" : "OFFLINE"}</span>
            </div>
          )}

          {/* AI Processing Badge matching reference screenshot */}
          {feedMode === "annotated" && isLive && (
            <div className="flex items-center gap-1.5 rounded-md bg-black/60 backdrop-blur-xs px-2.5 py-1 text-[11px] font-medium text-slate-200 ring-1 ring-white/10">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>AI Processing...</span>
            </div>
          )}

          <span className="font-semibold text-xs text-white truncate max-w-[120px] xs:max-w-xs sm:max-w-md ml-1">
            {camera?.name || "CCTV Camera Stream"}
          </span>
          <span className="hidden xs:inline-block font-mono text-[11px] text-slate-400">
            #{camera?.cameraId}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Real-time Clock matching reference screenshot (e.g. 2026-10-23 14:28:15) */}
          <div className="hidden sm:inline-block rounded-md bg-black/60 backdrop-blur-xs px-2.5 py-1 text-[11px] font-mono text-slate-200 ring-1 ring-white/10">
            {currentTime.toISOString().slice(0, 10)} {currentTime.toTimeString().slice(0, 8)}
          </div>

          {/* AI Annotated vs Raw Stream toggle button */}
          {isMjpeg && (
            <button
              type="button"
              onClick={() => {
                const nextMode = feedMode === "annotated" ? "raw" : "annotated";
                setFeedMode(nextMode);
                const ticket = streamInfo?.streamTicket;
                const ticketParam = ticket ? `ticket=${encodeURIComponent(ticket)}&` : "";
                const activeSrc =
                  nextMode === "annotated"
                    ? (streamInfo?.annotatedProxyUrl || `/api/v1/cameras/${camera?._id || camera?.id}/annotated-stream?${ticketParam}t=${Date.now()}`)
                    : usingProxy
                    ? (streamInfo?.proxyUrl || `/api/v1/cameras/${camera?._id || camera?.id}/stream-proxy?${ticketParam}t=${Date.now()}`)
                    : streamUrl;
                setMjpegSrc(activeSrc);
              }}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ring-1 ring-white/15 ${
                feedMode === "annotated"
                  ? "bg-emerald-600/90 text-white hover:bg-emerald-500"
                  : "bg-slate-800/90 text-slate-300 hover:text-white"
              }`}
              title="Toggle AI bounding boxes vs raw stream"
            >
              {feedMode === "annotated" ? "AI Vision Active" : "Raw CCTV"}
            </button>
          )}

          {/* Quality Selector */}
          {availableQualities.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5">
              <Sliders size={13} className="text-slate-400" />
              <select
                value={selectedQuality}
                onChange={(e) => handleQualityChange(e.target.value)}
                aria-label="Stream Resolution"
                className="rounded-lg border border-white/20 bg-black/60 px-2 py-1 text-[11px] font-medium text-white focus:outline-none focus:ring-1 focus:ring-[#B26262]"
              >
                {availableQualities.map((q) => (
                  <option key={q} value={q} className="bg-slate-900 text-white">
                    {q === "auto" ? "Auto (Adaptive)" : q}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Player Bottom Control Bar */}
      <div
        className={`absolute bottom-0 inset-x-0 z-20 flex flex-col justify-end bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2.5 sm:p-4 pt-8 sm:pt-10 transition-opacity duration-300 ${
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        {/* Timeline Bar: Only rendered when genuine DVR / recording is supported */}
        {dvrSupported ? (
          <div className="mb-2.5 flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="100"
              defaultValue="100"
              className="h-1 w-full cursor-pointer appearance-none rounded-lg bg-slate-700 accent-[#B26262]"
              aria-label="Recorded playback timeline"
            />
          </div>
        ) : (
          <div className="mb-1.5 flex flex-wrap items-center justify-between text-[10px] text-slate-400 font-mono gap-1">
            <span>REAL-TIME STREAM ONLY</span>
            <span className="hidden xs:inline">TIMELINE SEEKING DISABLED (NO DVR BUFFER)</span>
          </div>
        )}

        {/* Control Buttons Strip */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Previous Frame (SkipBack) */}
            <button
              type="button"
              onClick={() => showNotice("Frame stepping unavailable on live MJPEG stream without DVR buffer.")}
              title="Step backward (Live-only stream: requires DVR)"
              aria-label="Previous frame"
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/20 hover:text-white transition"
            >
              <SkipBack size={16} />
            </button>

            {/* Play / Pause Toggle */}
            <button
              type="button"
              onClick={togglePlay}
              disabled={isStreamUnavailable}
              aria-label={isPlaying ? "Pause stream" : "Play stream"}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-[#B26262]/30 disabled:opacity-40"
            >
              {isPlaying && !isPaused ? <Pause size={18} /> : <Play size={18} />}
            </button>

            {/* Next Frame (SkipForward) */}
            <button
              type="button"
              onClick={() => showNotice("Frame stepping unavailable: already at live stream edge.")}
              title="Step forward (Already at live edge)"
              aria-label="Next frame"
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-white/20 hover:text-white transition"
            >
              <SkipForward size={16} />
            </button>

            {/* Jump to Live Button */}
            {isPaused && (
              <button
                type="button"
                onClick={handleGoLive}
                aria-label="Jump to live edge"
                className="flex items-center gap-1 rounded-md bg-emerald-600/90 px-2 py-1 text-[11px] font-bold text-white transition hover:bg-emerald-600 active:scale-95"
              >
                <Radio size={12} />
                <span>Go Live</span>
              </button>
            )}

            {/* Mute and Volume Control */}
            <div className="flex items-center gap-1 sm:gap-1.5 ml-1">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={isMuted ? "Unmute audio" : "Mute audio"}
                title={isMjpeg ? "Audio unavailable on MJPEG feed" : isMuted ? "Unmute" : "Mute"}
                className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-white transition hover:bg-white/20 focus:outline-none"
              >
                {isMuted || volume === 0 ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume slider"
                className="hidden sm:inline-block h-1 w-12 sm:w-16 cursor-pointer appearance-none rounded-lg bg-slate-700 accent-[#B26262]"
              />
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Fit mode toggle (Contain vs Cover) */}
            <button
              type="button"
              onClick={() => setFitMode((prev) => (prev === "contain" ? "cover" : "contain"))}
              title={`Video Aspect Fit: ${fitMode === "cover" ? "Cover (Fill)" : "Contain (Fit Frame)"}`}
              aria-label="Toggle video fit mode"
              className="flex items-center gap-1 h-8 px-2 sm:h-9 sm:px-2.5 rounded-lg text-[11px] font-mono text-slate-300 transition hover:bg-white/20 hover:text-white"
            >
              <Scan size={15} />
              <span className="hidden sm:inline uppercase">{fitMode}</span>
            </button>

            {/* Reconnect button */}
            <button
              type="button"
              onClick={handleManualReconnect}
              title="Reconnect stream"
              aria-label="Reconnect stream"
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/20 hover:text-white"
            >
              <RotateCcw size={16} />
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
              className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-white transition hover:bg-white/20 focus:outline-none"
            >
              {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
            </button>
          </div>
        </div>
      </div>

      {/* Floating Notice Popup */}
      {unsupportedNotice && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 rounded-xl bg-slate-900/95 border border-slate-700 px-3.5 py-1.5 text-xs text-slate-200 shadow-xl backdrop-blur-md">
          <Info size={14} className="text-[#B26262] shrink-0" />
          <span>{unsupportedNotice}</span>
        </div>
      )}
    </div>
  );
}
