import { Video } from "lucide-react";
import CameraTile from "./CameraTile";
import { Skeleton, EmptyState, Button } from "../../components/ui";

export default function CameraGrid({
  cameras = [],
  loading = false,
  onInspect,
  onStatusChange,
  emptyMessage = "No camera feeds registered in this zone.",
  onResetFilters = null,
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <EmptyState
        title="No cameras found"
        description={emptyMessage}
        icon={Video}
        action={
          typeof onResetFilters === "function" ? (
            <Button variant="outline" size="sm" onClick={onResetFilters}>
              Clear Filters
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {cameras.map((camera) => (
        <CameraTile
          key={camera.cameraId || camera._id || camera.id}
          camera={camera}
          onInspect={onInspect}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  );
}
