import { VideoOff, WifiOff } from "lucide-react";

/**
 * DisconnectedOverlay displays a clear, accessible offline indicator
 * for cameras that are unreachable, offline, or experiencing edge packet loss.
 *
 * CRITICAL REQUIREMENT:
 * Displays the exact string: "Camera is Disconnected / Footage Not Available".
 * Explicitly distinguishes hardware/network connectivity from campus safety incidents.
 */
export default function DisconnectedOverlay({
  cameraId = null,
  compact = false,
  className = "",
}) {
  return (
    <div
      role="status"
      aria-label="Camera disconnected"
      className={`relative flex flex-col items-center justify-center bg-slate-950 p-4 text-center select-none ${className}`}
    >
      {/* Background static texture pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] opacity-25" />

      <div className="relative z-10 flex flex-col items-center gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-slate-400 ring-1 ring-slate-800">
          <VideoOff size={22} className="text-slate-400" />
        </div>

        <div className="space-y-1">
          {/* Exact required offline contract string */}
          <p className="text-xs font-semibold text-slate-200">
            Camera is Disconnected / Footage Not Available
          </p>

          {!compact && (
            <p className="max-w-xs text-[11px] text-slate-400">
              Edge node telemetry interrupted. This is an operational connectivity status, not a safety incident.
            </p>
          )}
        </div>

        <div className="mt-1 flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/90 px-2.5 py-1 text-[10px] font-mono text-slate-400">
          <WifiOff size={11} className="text-amber-500" />
          <span>{cameraId ? `NODE: ${cameraId}` : "SIGNAL LOST"}</span>
          <span className="text-slate-600">•</span>
          <span className="text-amber-400/90">Awaiting Telemetry</span>
        </div>
      </div>
    </div>
  );
}
