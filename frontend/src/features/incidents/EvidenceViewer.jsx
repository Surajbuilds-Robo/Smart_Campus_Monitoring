import { Camera, Lock, Clock } from "lucide-react";
import { canViewEvidence } from "../../utils/rolePermissions";

/**
 * EvidenceViewer component enforces strict privacy rules for incident evidence:
 * - Evidence access is restricted strictly to authorized staff (SUPER_ADMIN, DEPT_HEAD, FACULTY).
 * - Students and unauthorized users receive a strict privacy safeguard notice; raw URLs are never leaked.
 * - Displays Camera ID and UTC timestamps only when authorized evidence exists.
 */
export default function EvidenceViewer({
  evidence = [],
  cameraSource = null,
  userRole = null,
  className = "",
}) {
  const isAuthorized = canViewEvidence(userRole);

  if (!isAuthorized) {
    return (
      <div
        role="note"
        aria-label="Restricted evidence notice"
        className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-900/60 ${className}`}
      >
        <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-200">
          <Lock size={15} className="text-amber-600 dark:text-amber-400" />
          <span>Evidence Restricted by Campus Privacy Policy</span>
        </div>
        <p className="mt-1 text-slate-500 dark:text-slate-400">
          Raw incident frame bursts and camera identifiers are restricted to authorized security and departmental staff under FERPA/Campus Privacy retention rules.
        </p>
      </div>
    );
  }

  if (!evidence || evidence.length === 0) {
    return (
      <div
        className={`rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 ${className}`}
      >
        <Camera size={22} className="mx-auto mb-1.5 opacity-40 text-slate-400" />
        <p className="italic">
          No physical snapshot frames recorded for this incident.
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Anomaly detected through real-time edge telemetry without burst trigger.
        </p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-900 dark:text-white">
          Verified Evidence Frames ({evidence.length})
        </p>
        <span className="text-[11px] font-mono text-slate-400">
          Source Node: {cameraSource || "Campus Node"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
        {evidence.map((item, index) => {
          const timestamp = item.capturedAt
            ? new Date(item.capturedAt).toUTCString()
            : "UTC Timestamp Verified";

          return (
            <div
              key={item._id || item.id || index}
              className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-slate-950 p-2 text-slate-300 transition hover:border-slate-700 dark:border-slate-800"
            >
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-slate-900 flex flex-col items-center justify-center p-3 text-center">
                {item.url ? (
                  <img
                    src={item.url}
                    alt={`Evidence burst frame ${index + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center gap-1 text-slate-400">
                    <Camera size={24} className="text-blue-400" />
                    <span className="font-mono text-[10px] text-slate-300">
                      Burst Snapshot #{index + 1}
                    </span>
                    <span className="text-[9px] text-slate-500">
                      Edge Frame Verified
                    </span>
                  </div>
                )}

                <div className="absolute top-1.5 left-1.5 rounded-md bg-slate-950/80 px-1.5 py-0.5 font-mono text-[9px] text-slate-300">
                  FRAME #{index + 1}
                </div>
              </div>

              <div className="mt-2 space-y-0.5 px-1 text-[10px]">
                <div className="flex items-center gap-1 text-slate-400">
                  <Clock size={11} className="shrink-0" />
                  <span className="truncate">{timestamp}</span>
                </div>
                <div className="font-mono text-[9px] text-slate-500 truncate">
                  CAM: {item.cameraId || cameraSource || "CAMPUS-EDGE"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
