import { Clock, ArrowRight } from "lucide-react";
import { IncidentSeverityBadge, IncidentStatusBadge } from "./IncidentBadge";
import { Button, Card, CardContent } from "../../components/ui";

export default function IncidentCard({
  incident,
  onSelect,
  compact = false,
  className = "",
}) {
  if (!incident) return null;

  const eventLabel =
    incident.eventType?.replace(/_/g, " ").toUpperCase() || "SECURITY EVENT";

  return (
    <Card
      className={`transition-all duration-200 hover:shadow-md ${
        compact ? "p-3" : "p-4"
      } ${className}`}
    >
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <IncidentSeverityBadge severity={incident.severity} />
              <IncidentStatusBadge status={incident.status} />
              <span className="font-mono text-[11px] text-slate-400">
                #{incident.incidentId || incident._id}
              </span>
            </div>

            <h4 className="text-sm font-bold text-slate-900 dark:text-white">
              {eventLabel}
            </h4>

            <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
              {incident.description}
            </p>

            <div className="flex items-center gap-3 pt-1 text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {incident.createdAt
                  ? new Date(incident.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Just now"}
              </span>

              {incident.confidence !== null && incident.confidence !== undefined && (
                <span>
                  Confidence: {Math.round(incident.confidence * 100)}%
                </span>
              )}
            </div>
          </div>

          {typeof onSelect === "function" && (
            <div className="shrink-0 self-end sm:self-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onSelect(incident)}
                icon={ArrowRight}
                className="min-h-[44px]"
              >
                Inspect
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
