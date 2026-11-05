import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Bell,
  CheckCircle2,
  AlertTriangle,
  Video,
  Users,
  Radio,
  RefreshCw,
  CheckCheck,
} from "lucide-react";
import { notificationApi } from "../services/campusApi";
import useSocketEvent from "../hooks/useSocketEvent";
import {
  Button,
  Card,
  CardContent,
  PageHeader,
  Skeleton,
  EmptyState,
  ErrorState,
} from "../components/ui";
import {
  IncidentSeverityBadge,
} from "../features/incidents";

const typeIcons = {
  incident_created: AlertTriangle,
  incident_updated: AlertTriangle,
  incident_assigned: AlertTriangle,
  camera_status: Video,
  occupancy_warning: Users,
  system_alert: Radio,
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await notificationApi.list({ unreadOnly });
      setNotifications(data || []);
    } catch {
      setError("Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [unreadOnly]);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const data = await notificationApi.list({ unreadOnly });
        if (active) setNotifications(data || []);
      } catch {
        if (active) setError("Failed to load notifications.");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
    };
  }, [unreadOnly]);

  // Realtime notification arrival
  useSocketEvent("notification:created", (event) => {
    setNotifications((prev) => [event, ...prev]);
  });

  const handleMarkAsRead = async (id) => {
    try {
      await notificationApi.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n._id === id || n.id === id ? { ...n, readAt: new Date() } : n))
      );
    } catch {
      // Ignore failure
    }
  };

  const handleMarkAllRead = async () => {
    setActionLoading(true);
    try {
      await notificationApi.markAllRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, readAt: n.readAt || new Date() }))
      );
    } catch {
      // Ignore failure
    } finally {
      setActionLoading(false);
    }
  };

  const unreadCount = useMemo(() => {
    return notifications.filter((n) => !n.readAt).length;
  }, [notifications]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="System announcements, security alerts, and operational changes"
        icon={Bell}
      >
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAllRead}
              loading={actionLoading}
              icon={CheckCheck}
            >
              Mark All as Read
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNotifications}
            loading={loading}
            icon={RefreshCw}
          >
            Refresh
          </Button>
        </div>
      </PageHeader>

      {error && (
        <ErrorState
          title="Notifications unavailable"
          description={error}
          onRetry={fetchNotifications}
        />
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setUnreadOnly(false)}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
            !unreadOnly
              ? "bg-[#B26262] text-white shadow-xs"
              : "bg-white text-[#806B6A] border border-[#E5D6D6] hover:bg-[#F0E3E3]"
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setUnreadOnly(true)}
          className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
            unreadOnly
              ? "bg-[#B26262] text-white shadow-xs"
              : "bg-white text-[#806B6A] border border-[#E5D6D6] hover:bg-[#F0E3E3]"
          }`}
        >
          Unread Only ({unreadCount})
        </button>
      </div>

      {/* Notification List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="No notifications"
                description={
                  unreadOnly
                    ? "You are completely caught up! No unread notifications."
                    : "No notification records found."
                }
                icon={Bell}
              />
            </div>
          ) : (
            <div className="divide-y divide-[#E5D6D6]">
              {notifications.map((item) => {
                const isUnread = !item.readAt;
                const Icon = typeIcons[item.type] || Bell;

                return (
                  <div
                    key={item._id || item.id}
                    className={`flex items-start justify-between p-4 transition ${
                      isUnread
                        ? "bg-[#F6EDED]/60"
                        : "hover:bg-[#FBF3F3]"
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                          item.type?.includes("incident")
                            ? "bg-[#FDECEC] text-[#C62828]"
                            : item.type?.includes("camera")
                            ? "bg-[#F6EDED] text-[#B26262]"
                            : "bg-[#FBF3F3] text-[#806B6A]"
                        }`}
                      >
                        <Icon size={16} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-xs text-[#3C1414]">
                            {item.title}
                          </p>
                          {item.severity && (
                            <IncidentSeverityBadge severity={item.severity} />
                          )}
                          {isUnread && (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#B26262]" />
                          )}
                        </div>
                        <p className="mt-1 text-xs text-[#806B6A]">
                          {item.message}
                        </p>
                        <p className="mt-1 text-[11px] text-[#76808D]">
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "Recent"}
                        </p>
                      </div>
                    </div>

                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => handleMarkAsRead(item._id || item.id)}
                        title="Mark as read"
                        className="ml-3 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800"
                      >
                        <CheckCircle2 size={16} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
