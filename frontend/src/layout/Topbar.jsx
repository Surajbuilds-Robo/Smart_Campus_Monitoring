import { useState, useRef, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import {
  Menu,
  Search,
  Bell,
  KeyRound,
  LogOut,
  ChevronDown,
  Landmark,
  Settings,
  AlertTriangle,
  Video,
  Users,
  Radio,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { notificationApi } from "../services/campusApi";
import useSocketEvent from "../hooks/useSocketEvent";
import { formatRelativeTime } from "../utils/time";
import ChangePasswordModal from "./ChangePasswordModal";

function getNotificationIcon(type) {
  if (!type) return Bell;
  if (type.includes("incident")) return AlertTriangle;
  if (type.includes("camera")) return Video;
  if (type.includes("occupancy")) return Users;
  if (type.includes("system")) return Radio;
  return Bell;
}

export default function Topbar({
  user: userProp,
  title = "Dashboard",
  connected = false,
  onMenuClick,
  sidebarOpen = false,
  onLogout: onLogoutProp,
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const user = userProp !== undefined ? userProp : auth.user;
  const onLogout = onLogoutProp || auth.logout;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Notification state
  const [notifications, setNotifications] = useState([]);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);

  const dropdownRef = useRef(null);
  const buttonRef = useRef(null);
  const notificationContainerRef = useRef(null);
  const notificationCloseTimer = useRef(null);

  const initials = (user?.name || "U")
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const userHandle = user?.email
    ? `@${user.email.split("@")[0]}`
    : "@campus.user";

  // Fetch notifications
  useEffect(() => {
    let active = true;
    async function loadNotifications() {
      try {
        setNotificationsLoading(true);
        const data = await notificationApi.list({ limit: 10 });
        if (active && Array.isArray(data)) {
          setNotifications(data);
        }
      } catch {
        // Silently handle load failure
      } finally {
        if (active) setNotificationsLoading(false);
      }
    }

    if (user) {
      loadNotifications();
    }

    return () => {
      active = false;
    };
  }, [user]);

  // Realtime notification arrival via websocket
  useSocketEvent("notification:created", (event) => {
    if (!event) return;
    setNotifications((prev) => {
      const exists = prev.some((n) => (n._id || n.id) === (event._id || event.id));
      if (exists) return prev;
      return [event, ...prev];
    });
  });

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  // Notification hover handlers with debounce
  const handleNotificationMouseEnter = () => {
    if (notificationCloseTimer.current) {
      clearTimeout(notificationCloseTimer.current);
      notificationCloseTimer.current = null;
    }
    setNotificationOpen(true);
  };

  const handleNotificationMouseLeave = () => {
    if (notificationCloseTimer.current) {
      clearTimeout(notificationCloseTimer.current);
    }
    notificationCloseTimer.current = setTimeout(() => {
      setNotificationOpen(false);
    }, 250);
  };

  const handleNotificationToggle = () => {
    if (notificationCloseTimer.current) {
      clearTimeout(notificationCloseTimer.current);
      notificationCloseTimer.current = null;
    }
    setNotificationOpen((prev) => !prev);
  };

  const handleNotificationClick = async (notif) => {
    const id = notif._id || notif.id;
    if (!notif.readAt && id) {
      try {
        await notificationApi.markRead(id);
        setNotifications((prev) =>
          prev.map((n) => ((n._id || n.id) === id ? { ...n, readAt: new Date() } : n))
        );
      } catch {
        // Ignore failure
      }
    }
    setNotificationOpen(false);
    if (notif.type?.includes("incident")) {
      navigate("/incidents");
    } else if (notif.type?.includes("camera")) {
      navigate("/cameras");
    } else if (notif.type?.includes("occupancy")) {
      navigate("/crowd");
    } else {
      navigate("/notifications");
    }
  };

  // Close menus on outside click or Escape key
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setDropdownOpen(false);
      }

      if (
        notificationContainerRef.current &&
        !notificationContainerRef.current.contains(event.target)
      ) {
        setNotificationOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setDropdownOpen(false);
        setNotificationOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (notificationCloseTimer.current) {
        clearTimeout(notificationCloseTimer.current);
      }
    };
  }, []);

  const handleSignOut = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setDropdownOpen(false);

    try {
      if (typeof onLogout === "function") {
        await onLogout();
      }
    } catch {
      // Best-effort logout; local clearance is authoritative
    } finally {
      setIsLoggingOut(false);
      navigate("/login");
    }
  };

  const handleExecuteSearch = (rawQuery) => {
    const q = (rawQuery !== undefined ? rawQuery : searchQuery).trim().toLowerCase();
    if (!q) return;
    if (q.includes("park") || q.includes("slot")) {
      navigate("/parking");
    } else if (q.includes("cam") || q.includes("video") || q.includes("gate")) {
      navigate("/cameras");
    } else if (q.includes("canteen") || q.includes("crowd")) {
      navigate("/crowd");
    } else if (q.includes("incid") || q.includes("alert")) {
      navigate("/incidents");
    } else if (q.includes("class") || q.includes("lab") || q.includes("resource")) {
      navigate("/resources");
    } else if (q.includes("user")) {
      navigate("/users");
    } else if (q.includes("setting")) {
      navigate("/settings");
    } else if (q.includes("notif")) {
      navigate("/notifications");
    } else {
      navigate("/dashboard");
    }
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === "Enter") {
      handleExecuteSearch();
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-[#E5D6D6] bg-white/95 px-3 backdrop-blur-xs sm:px-6">
        {/* Left: Mobile Menu Toggle, Blue University Logo & Rounded Search Bar */}
        <div className="flex min-w-0 items-center gap-1.5 xs:gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label="Toggle navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="main-sidebar"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#806B6A] transition hover:bg-[#F0E3E3] hover:text-[#3C1414] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 active:scale-95 lg:hidden"
          >
            <Menu size={20} />
          </button>

          {/* Blue University Logo Tile (Moved to Topbar, left of search input) */}
          <Link
            to="/dashboard"
            title="Smart Campus Monitoring"
            aria-label="Smart Campus Monitoring - Go to Dashboard"
            className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-xl bg-[#B26262] text-white shadow-xs transition hover:bg-[#9E5353] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 active:scale-95"
          >
            <Landmark size={18} className="sm:w-5 sm:h-5" />
          </Link>

          {/* Rounded Pill Search Bar (YouTube Style) */}
          <div className="relative flex min-w-0 items-center">
            <span className="sr-only">{title}</span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search anything..."
              aria-label="Search anything..."
              className="h-9 sm:h-10 w-24 xs:w-36 sm:w-60 md:w-80 min-w-0 rounded-l-full border border-r-0 border-[#E5D6D6] bg-[#F6EDED] py-1.5 sm:py-2 pl-3 sm:pl-4 pr-2 sm:pr-3 text-xs text-[#3C1414] placeholder:text-[#806B6A] transition-all focus:border-[#B26262] focus:bg-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => handleExecuteSearch()}
              aria-label="Submit search"
              className="flex h-9 sm:h-10 shrink-0 items-center justify-center rounded-r-full border border-[#E5D6D6] bg-[#F0E3E3] px-3 sm:px-4 text-[#806B6A] transition hover:bg-[#E5D6D6] hover:text-[#3C1414] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 active:scale-95"
            >
              <Search size={16} />
            </button>
          </div>
        </div>

        {/* Right: Notifications & Profile Trigger with Name and Dropdown Arrow */}
        <div className="flex shrink-0 items-center gap-1.5 xs:gap-3 sm:gap-4">
          {/* Notification Bell with Dynamic Unread Badge & Hover Dropdown */}
          <div
            ref={notificationContainerRef}
            onMouseEnter={handleNotificationMouseEnter}
            onMouseLeave={handleNotificationMouseLeave}
            className="relative"
          >
            <button
              type="button"
              onClick={handleNotificationToggle}
              aria-label={
                unreadCount > 0
                  ? `View notifications, ${unreadCount} unread`
                  : "View notifications"
              }
              aria-haspopup="true"
              aria-expanded={notificationOpen}
              className="relative flex h-9 w-9 items-center justify-center rounded-full text-[#806B6A] transition hover:bg-[#F0E3E3] hover:text-[#3C1414] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 active:scale-95"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#B26262] px-1 text-[10px] font-bold text-white shadow-xs">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>

            {/* Hover / Click Notification Dropdown (matches reference screenshot) */}
            {notificationOpen && (
              <div
                role="region"
                aria-label="Notifications preview"
                className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1.5rem)] max-w-xs sm:w-96 sm:max-w-none origin-top-right overflow-hidden rounded-2xl border border-[#E5D6D6] bg-white text-[#3C1414] shadow-2xl shadow-[#3C1414]/10"
              >
                {/* Header: Title and Settings Icon */}
                <div className="flex items-center justify-between border-b border-[#E5D6D6] px-4 py-3 bg-[#F6EDED]/60">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#3C1414]">
                      Notifications
                    </h3>
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-[#F6EDED] px-2 py-0.5 text-[10px] font-bold text-[#B26262]">
                        {unreadCount} new
                      </span>
                    )}
                  </div>
                  <Link
                    to="/notifications"
                    onClick={() => setNotificationOpen(false)}
                    title="Notification settings"
                    aria-label="Notification settings"
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-[#806B6A] transition hover:bg-[#F0E3E3] hover:text-[#3C1414]"
                  >
                    <Settings size={15} />
                  </Link>
                </div>

                {/* Notifications List */}
                {notificationsLoading && notifications.length === 0 ? (
                  <div className="space-y-3 p-4">
                    <div className="h-12 w-full animate-pulse rounded-xl bg-[#F6EDED]" />
                    <div className="h-12 w-full animate-pulse rounded-xl bg-[#F6EDED]" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-4 py-8 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F6EDED] text-[#806B6A]">
                      <Bell size={20} />
                    </div>
                    <p className="mt-2.5 text-xs font-semibold text-[#3C1414]">
                      No notifications
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#806B6A]">
                      You are completely caught up!
                    </p>
                  </div>
                ) : (
                  <div className="max-h-80 divide-y divide-[#E5D6D6]/80 overflow-y-auto">
                    {notifications.slice(0, 8).map((item) => {
                      const isUnread = !item.readAt;
                      const Icon = getNotificationIcon(item.type);
                      return (
                        <div
                          key={item._id || item.id}
                          onClick={() => handleNotificationClick(item)}
                          className={`group flex cursor-pointer items-start gap-3 p-3.5 transition hover:bg-[#F6EDED] ${
                            isUnread ? "bg-[#F6EDED]/40" : "bg-white"
                          }`}
                        >
                          {/* Circular Monogram / Icon */}
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B26262] text-white shadow-xs">
                            <Icon size={16} />
                          </div>

                          {/* Title, message and timestamp */}
                          <div className="min-w-0 flex-1">
                            <p className="line-clamp-2 text-xs font-semibold leading-snug text-[#3C1414]">
                              {item.title}
                            </p>
                            {item.message && (
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-[#806B6A]">
                                {item.message}
                              </p>
                            )}
                            <p className="mt-1 text-[10px] text-[#806B6A]/80">
                              {formatRelativeTime(item.createdAt)}
                            </p>
                          </div>

                          {/* Unread indicator */}
                          {isUnread && (
                            <div className="flex shrink-0 items-center pt-1.5">
                              <span className="h-2 w-2 rounded-full bg-[#B26262] ring-2 ring-[#B26262]/20" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer Link */}
                <div className="border-t border-[#E5D6D6] bg-[#F6EDED]/40 px-4 py-2.5 text-center">
                  <Link
                    to="/notifications"
                    onClick={() => setNotificationOpen(false)}
                    className="text-xs font-semibold text-[#B26262] transition hover:text-[#9E5353]"
                  >
                    View all notifications →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Screenshot User Profile Trigger (Avatar + Name + Handle/Role + Chevron) */}
          <div className="relative">
            <button
              ref={buttonRef}
              type="button"
              id="user-account-menu-button"
              onClick={() => setDropdownOpen((prev) => !prev)}
              aria-label="Open account menu"
              aria-haspopup="menu"
              aria-expanded={dropdownOpen}
              className="flex items-center gap-2.5 rounded-xl p-1 text-left transition hover:bg-[#F0E3E3] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F6EDED] text-xs font-bold text-[#B26262] ring-2 ring-[#B26262]/20">
                {user?.profileImage || user?.avatar ? (
                  <img
                    src={user.profileImage || user.avatar}
                    alt={user?.name || "Profile"}
                    className="h-full w-full rounded-full object-cover"
                  />
                ) : (
                  <span>{initials}</span>
                )}
              </div>

              <div className="hidden text-left sm:block">
                <p className="truncate text-xs font-bold leading-tight text-[#3C1414]">
                  {user?.name || "Suraj Kumar"}
                </p>
                <p className="truncate text-[10px] font-medium leading-tight text-[#806B6A]">
                  {user?.role === "SUPER_ADMIN"
                    ? "Super Admin"
                    : user?.role === "DEPT_HEAD"
                    ? "Department Head"
                    : user?.role
                    ? user.role.replace(/_/g, " ")
                    : userHandle || "Super Admin"}
                </p>
              </div>

              <ChevronDown
                size={14}
                className={`text-[#806B6A] transition-transform duration-200 ${
                  dropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Account Dropdown Menu */}
            {dropdownOpen && (
              <div
                ref={dropdownRef}
                role="menu"
                aria-orientation="vertical"
                aria-labelledby="user-account-menu-button"
                className="absolute right-0 top-full z-50 mt-2 w-[calc(100vw-1.5rem)] max-w-xs sm:w-72 sm:max-w-none origin-top-right rounded-2xl border border-[#E5D6D6] bg-white p-2 text-[#3C1414] shadow-xl shadow-[#3C1414]/10"
              >
                {/* A. User Information Header */}
                <div className="flex items-center gap-3 p-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F6EDED] text-sm font-bold text-[#B26262] ring-2 ring-[#B26262]/20">
                    {user?.profileImage || user?.avatar ? (
                      <img
                        src={user.profileImage || user.avatar}
                        alt={user?.name || "Profile"}
                        className="h-full w-full rounded-full object-cover"
                      />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#3C1414]">
                      {user?.name || "Campus Operator"}
                    </p>
                    <p className="truncate text-xs text-[#806B6A]">
                      {user?.email || user?.username || "No email available"}
                    </p>
                    {user?.role && (
                      <span className="mt-1 inline-block rounded-md bg-[#F6EDED] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#B26262]">
                        {user.role.replace(/_/g, " ")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="my-1 border-t border-[#E5D6D6]" />

                {/* B. Change Password Menu Item */}
                <button
                  type="button"
                  role="menuitem"
                  id="menu-item-change-password"
                  onClick={() => {
                    setDropdownOpen(false);
                    setPasswordModalOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-[#3C1414] transition hover:bg-[#F6EDED] focus:bg-[#F6EDED] focus:outline-none"
                >
                  <KeyRound size={16} className="text-[#806B6A]" />
                  <span>Change Password</span>
                </button>

                {/* C. Sign Out Menu Item */}
                <button
                  type="button"
                  role="menuitem"
                  id="menu-item-sign-out"
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-[#C62828] transition hover:bg-[#FDECEC] focus:bg-[#FDECEC] focus:outline-none disabled:opacity-50"
                >
                  <LogOut size={16} />
                  <span>{isLoggingOut ? "Signing out..." : "Sign out"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Change Password Dialog */}
      <ChangePasswordModal
        isOpen={passwordModalOpen}
        onClose={() => setPasswordModalOpen(false)}
      />
    </>
  );
}
