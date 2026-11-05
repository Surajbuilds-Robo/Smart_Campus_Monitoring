import {
  AlertOctagon,
  AlertTriangle,
  Info,
  CheckCircle2,
  Clock,
  Search,
  XCircle,
} from "lucide-react";

/**
 * Accessible status and severity badges that do NOT rely on color alone.
 * Pairs clear semantic icons and explicit text labels with high-contrast variants.
 * Mandatory Severity Colors:
 * - HIGH: Red (#C62828, bg #FDECEC)
 * - MEDIUM: Yellow/Amber (#A66A00, bg #FFF4CC)
 * - LOW: Green (#287A43, bg #E7F5EA)
 */

export function IncidentSeverityBadge({ severity = "info", className = "" }) {
  const norm = severity?.toLowerCase() || "info";

  if (norm === "critical" || norm === "high") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-[#C62828]/35 bg-[#FDECEC] px-2.5 py-1 text-xs font-bold text-[#C62828] ${className}`}
      >
        <AlertOctagon size={13} className="shrink-0 text-[#C62828]" />
        <span>HIGH</span>
      </span>
    );
  }

  if (norm === "warning" || norm === "medium") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-[#A66A00]/35 bg-[#FFF4CC] px-2.5 py-1 text-xs font-bold text-[#A66A00] ${className}`}
      >
        <AlertTriangle size={13} className="shrink-0 text-[#A66A00]" />
        <span>MEDIUM</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[#287A43]/35 bg-[#E7F5EA] px-2.5 py-1 text-xs font-bold text-[#287A43] ${className}`}
    >
      <Info size={13} className="shrink-0 text-[#287A43]" />
      <span>LOW</span>
    </span>
  );
}

export function IncidentStatusBadge({ status = "new", className = "" }) {
  const norm = status?.toLowerCase() || "new";

  if (norm === "resolved") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-[#287A43]/30 bg-[#E7F5EA] px-2.5 py-1 text-xs font-semibold text-[#287A43] ${className}`}
      >
        <CheckCircle2 size={13} className="shrink-0 text-[#287A43]" />
        <span>Resolved</span>
      </span>
    );
  }

  if (norm === "investigating") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-[#B26262]/30 bg-[#F6EDED] px-2.5 py-1 text-xs font-semibold text-[#B26262] ${className}`}
      >
        <Search size={13} className="shrink-0 text-[#B26262]" />
        <span>Investigating</span>
      </span>
    );
  }

  if (norm === "acknowledged") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-[#A66A00]/30 bg-[#FFF4CC] px-2.5 py-1 text-xs font-semibold text-[#A66A00] ${className}`}
      >
        <Clock size={13} className="shrink-0 text-[#A66A00]" />
        <span>Acknowledged</span>
      </span>
    );
  }

  if (norm === "dismissed") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border border-[#E5D6D6] bg-[#F0E3E3] px-2.5 py-1 text-xs font-semibold text-[#806B6A] ${className}`}
      >
        <XCircle size={13} className="shrink-0 text-[#806B6A]" />
        <span>Dismissed</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[#C62828]/30 bg-[#FDECEC] px-2.5 py-1 text-xs font-semibold text-[#C62828] ${className}`}
    >
      <AlertTriangle size={13} className="shrink-0 text-[#C62828]" />
      <span>New</span>
    </span>
  );
}

export default {
  IncidentSeverityBadge,
  IncidentStatusBadge,
};
