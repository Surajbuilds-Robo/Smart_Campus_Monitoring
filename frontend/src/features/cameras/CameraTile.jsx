import { useState, useEffect, useRef } from "react";
import Hls from "hls.js";
import { Radio, Clock, Video, Maximize2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import DisconnectedOverlay from "./DisconnectedOverlay";
import { cameraApi } from "../../services/campusApi";
import { useAuth } from "../../hooks/useAuth";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "../../components/ui";

function formatLastSeen(dateStr) {
  if (!dateStr) return "Never connected";
  const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * Lightweight Camera Live Preview
 *
 * Enforces lowest practical preview resolution and resource release
 * using IntersectionObserver. Never simulates playback with fake loops.
 */
function CameraPreview({ streamUrl, streamType, isOnline, name, cameraId }) {
  const videoRef = useRef(null);
  const imgRef = useRef(null);
  const hlsRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [activeImgSrc, setActiveImgSrc] = useState("");
  const [usingProxy, setUsingProxy] = useState(false);

  const isMjpeg =
    streamType === "mjpeg" ||
    streamUrl.includes("/video") ||
    streamUrl.includes("/shot.jpg") ||
    streamUrl.includes("stream-proxy");

  useEffect(() => {
    if (!streamUrl || !isOnline) return;

    let isSubscribed = true;

    if (isMjpeg) {
      setActiveImgSrc(streamUrl);
      const img = imgRef.current;
      if (!img) return;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) {
              setActiveImgSrc("");
            } else if (isSubscribed && !hasError) {
              setActiveImgSrc(streamUrl);
            }
          });
        },
        { threshold: 0.1 }
      );

      observer.observe(img);

      return () => {
        isSubscribed = false;
        observer.disconnect();
      };
    }

    const video = videoRef.current;
    if (!video) return;

    // Release/pause preview resources when card is out of the active viewport
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            video.pause();
          } else if (isSubscribed && !hasError && video.paused) {
            video.play().catch(() => {});
          }
        });
      },
      { threshold: 0.2 }
    );

    observer.observe(video);

    const isHls =
      streamUrl.includes(".m3u8") ||
      video.canPlayType("application/vnd.apple.mpegurl");

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        maxBufferLength: 2,
        maxMaxBufferLength: 4,
        backBufferLength: 0,
        autoStartLoad: true,
      });
      hlsRef.current = hls;
      hls.loadSource(streamUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        // Enforce lowest preview resolution tier (index 0)
        if (data.levels && data.levels.length > 1) {
          hls.currentLevel = 0;
        }
        if (isSubscribed) {
          video.play().catch(() => {});
        }
      });

      hls.on(Hls.Events.ERROR, () => {
        if (isSubscribed) setHasError(true);
      });
    } else {
      video.src = streamUrl;
      video.play().catch(() => {});
    }

    return () => {
      isSubscribed = false;
      observer.disconnect();
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [streamUrl, streamType, isOnline, hasError, isMjpeg]);

  if (hasError) {
    return null;
  }

  if (isMjpeg) {
    return (
      <div className="relative h-full w-full bg-black flex items-center justify-center">
        {activeImgSrc ? (
          <img
            ref={imgRef}
            src={activeImgSrc}
            onLoad={() => setIsPlaying(true)}
            onError={async () => {
              if (!usingProxy && cameraId) {
                setUsingProxy(true);
                try {
                  const ticketRes = await cameraApi.getStreamTicket(cameraId);
                  if (ticketRes?.proxyUrl) {
                    setActiveImgSrc(ticketRes.proxyUrl);
                    return;
                  }
                } catch {}
                setHasError(true);
              } else {
                setHasError(true);
              }
            }}
            className="h-full w-full object-contain"
            alt={`Live preview of ${name}`}
          />
        ) : (
          <div ref={imgRef} className="h-full w-full bg-slate-950 flex items-center justify-center text-slate-600 text-xs font-mono">
            Preview paused
          </div>
        )}
        {isPlaying && (
          <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/80 px-2 py-0.5 text-[10px] font-bold text-emerald-400 backdrop-blur-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            MJPEG LIVE
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        muted
        playsInline
        preload="metadata"
        onPlaying={() => setIsPlaying(true)}
        onError={() => setHasError(true)}
        className="h-full w-full object-contain"
        aria-label={`Live preview of ${name}`}
      />
      {isPlaying && (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/80 px-2 py-0.5 text-[10px] font-bold text-emerald-400 backdrop-blur-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          PREVIEW
        </span>
      )}
    </div>
  );
}

/**
 * CameraTile: Lightweight, accessible camera card with on-demand preview.
 *
 * Keeps outer cards lightweight without expensive continuous high-res streams.
 * Distinguishes hardware connectivity from safety incidents.
 * Clicking the card opens the full CCTV viewer.
 */
export default function CameraTile({ camera, onInspect, onStatusChange }) {
  if (!camera) return null;

  const { user } = useAuth();
  const canManage = user?.role === "SUPER_ADMIN" || user?.role === "SECURITY";

  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectFeedback, setReconnectFeedback] = useState(null);

  // Verify connection: status is online AND heartbeat is verified within last 5 minutes
  const isHeartbeatVerified = Boolean(
    camera.lastHeartbeat &&
      Date.now() - new Date(camera.lastHeartbeat).getTime() < 5 * 60 * 1000
  );
  const isOnline = camera.status === "online" && isHeartbeatVerified;
  const isMaintenance = camera.status === "maintenance";
  const previewStreamUrl = camera.previewUrl || camera.streamUrl || "";
  const hasLiveStream = Boolean(previewStreamUrl && isOnline);

  const handleQuickReconnect = async (e) => {
    e.stopPropagation();
    setReconnecting(true);
    setReconnectFeedback(null);
    try {
      const res = await cameraApi.reconnect(camera._id || camera.id);
      if (res.reachable) {
        setReconnectFeedback({ success: true, text: `Live (${res.latencyMs}ms)` });
        onStatusChange?.(camera._id || camera.id, "online");
      } else {
        setReconnectFeedback({ success: false, text: "Server offline on phone" });
      }
    } catch (err) {
      setReconnectFeedback({
        success: false,
        text: err.response?.data?.message || "Reconnection failed",
      });
    } finally {
      setReconnecting(false);
    }
  };

  return (
    <Card
      onClick={() => onInspect?.(camera)}
      className="group flex flex-col overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg hover:border-[#B26262]/40"
    >
      <CardHeader className="flex flex-row items-start justify-between p-4">
        <div className="min-w-0 flex-1 pr-2">
          <CardTitle className="truncate text-sm font-semibold group-hover:text-[#B26262] transition">
            {camera.name}
          </CardTitle>
          <CardDescription className="truncate text-xs mt-0.5">
            {camera.location} {camera.building ? `• ${camera.building}` : ""}
          </CardDescription>
        </div>

        <Badge
          variant={reconnecting ? "warning" : isOnline ? "success" : isMaintenance ? "warning" : "danger"}
          dot
          className="shrink-0"
        >
          {reconnecting
            ? "connecting..."
            : isOnline
            ? "online"
            : isMaintenance
            ? "maintenance"
            : "disconnected"}
        </Badge>
      </CardHeader>

      {/* Feed Container */}
      <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
        {hasLiveStream ? (
          <CameraPreview
            streamUrl={previewStreamUrl}
            streamType={camera.streamType}
            isOnline={isOnline}
            name={camera.name}
            cameraId={camera._id || camera.id}
          />
        ) : isOnline ? (
          /* Verified online edge node awaiting live stream attachment */
          <div className="relative flex h-full w-full flex-col items-center justify-center p-4 text-center select-none">
            <div className="absolute inset-0 bg-radial from-slate-900/60 to-slate-950 opacity-90" />

            <div className="relative z-10 flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-slate-400 ring-1 ring-slate-800">
                <Radio size={20} className="text-slate-400" />
              </div>
              <p className="text-xs font-semibold text-slate-300">
                Camera Connected — Footage Unavailable
              </p>
              <p className="text-[11px] text-slate-400 max-w-xs">
                Edge hardware node verified. Live CCTV video stream is not currently streaming.
              </p>
            </div>

            <div className="absolute bottom-2 left-2 flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
              <span>NODE: {camera.cameraId || camera._id}</span>
              <span>•</span>
              <span className="text-amber-400/90">Awaiting Stream</span>
            </div>

            <div className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/90 px-2 py-0.5 font-mono text-[10px] text-slate-400">
              <span>STANDBY</span>
            </div>
          </div>
        ) : (
          <DisconnectedOverlay
            cameraId={camera.cameraId || camera._id}
            compact={false}
            className="h-full w-full"
          />
        )}

        {/* Hover Click Overlay Cue */}
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-[#B26262]/90 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur-xs">
            <Maximize2 size={14} />
            <span>Open CCTV Viewer</span>
          </span>
        </div>
      </div>

      <CardContent className="flex items-center justify-between p-3.5 text-xs text-[#806B6A] border-t border-[#E5D6D6]">
        <div className="flex flex-col min-w-0 pr-2">
          <div className="flex items-center gap-1.5 text-[#806B6A]">
            <Clock size={12} className="shrink-0" />
            <span className="truncate">
              {isOnline
                ? "Streaming live"
                : `Last seen: ${formatLastSeen(camera.lastSeenAt || camera.lastHeartbeat)}`}
            </span>
          </div>
          {reconnectFeedback && (
            <span
              className={`text-[10px] font-semibold truncate mt-0.5 ${
                reconnectFeedback.success ? "text-[#287A43]" : "text-[#A66A00]"
              }`}
            >
              {reconnectFeedback.text}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!isOnline && canManage && (
            <Button
              variant="ghost"
              size="sm"
              loading={reconnecting}
              icon={RefreshCw}
              onClick={handleQuickReconnect}
              title="Probe phone camera stream immediately"
              className="text-[11px] h-7 px-2 text-[#B26262] hover:text-[#9E5353] hover:bg-[#F6EDED]"
            >
              Reconnect
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onInspect?.(camera);
            }}
            className="text-xs min-h-[32px] h-7 px-2.5"
          >
            {isOnline ? "View Stream" : "Inspect"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
