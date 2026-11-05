import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { WifiOff } from "lucide-react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import PWAInstallBanner from "./PWAInstallBanner";
import { useSocket } from "../hooks/useSocket";
import { useAuth } from "../hooks/useAuth";

const SIDEBAR_COLLAPSED_KEY = "campus_sidebar_collapsed";

const pageTitles = {
  "/dashboard": "System Overview",
  "/cameras": "Camera Feeds",
  "/parking": "Parking Availability",
  "/crowd": "Crowd Monitoring",
  "/resources": "Campus Resources",
  "/incidents": "Incident Management",
  "/notifications": "Notifications",
  "/users": "User Management",
  "/settings": "System Settings",
};

export default function DashboardLayout({ user: userProp, onLogout: onLogoutProp }) {
  // Desktop collapsed preference persisted in localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
      } catch {
        return false;
      }
    }
    return false;
  });

  // Mobile drawer state (< 1024px)
  const [mobileOpen, setMobileOpen] = useState(false);

  const location = useLocation();
  const { connected } = useSocket();
  const auth = useAuth();

  const user = userProp !== undefined ? userProp : auth.user;
  const onLogout = onLogoutProp || auth.logout;

  const title =
    pageTitles[location.pathname] ||
    Object.entries(pageTitles).find(([path]) =>
      location.pathname.startsWith(`${path}/`)
    )?.[1] ||
    "Smart Campus";

  // Toggle collapsed mode on desktop and persist preference
  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Safe fallback if localStorage is blocked
      }
      return next;
    });
  };

  // Topbar hamburger click: controls mobile drawer on small screens, desktop rail toggle on larger screens
  const handleMenuClick = () => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setMobileOpen((prev) => !prev);
    } else {
      handleToggleCollapse();
    }
  };

  // Auto-close mobile drawer if window resizes to desktop breakpoint
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 1024) {
        setMobileOpen(false);
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex h-screen h-dvh w-full overflow-hidden bg-[#FBF3F3] text-[#3C1414]">
      {/* Accessible skip link for keyboard navigation */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-[#B26262] focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-[#B26262] focus:ring-offset-2"
      >
        Skip to main content
      </a>

      {/* Fixed Full-Height Sidebar */}
      <Sidebar
        user={user}
        collapsed={isCollapsed}
        onToggleCollapse={handleToggleCollapse}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onLogout={onLogout}
      />

      {/* Main Content Area with isolated vertical scroll */}
      <div className="flex min-w-0 flex-1 flex-col h-full overflow-y-auto overflow-x-hidden">
        <Topbar
          user={user}
          title={title}
          connected={connected}
          onMenuClick={handleMenuClick}
          sidebarOpen={mobileOpen || !isCollapsed}
          onLogout={onLogout}
        />

        <PWAInstallBanner />

        {/* Non-intrusive Realtime Disconnection Banner */}
        {!connected && (
          <aside
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-3 border-b border-amber-200/80 bg-amber-50/95 px-4 py-2 text-xs font-medium text-amber-900 sm:px-6 dark:border-amber-900/40 dark:bg-amber-950/60 dark:text-amber-200"
          >
            <div className="flex items-center gap-2">
              <WifiOff size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                Realtime stream disconnected. Running on cached polling — feeds and alerts reconcile automatically upon reconnection.
              </span>
            </div>
            <span className="hidden shrink-0 rounded-md bg-amber-200/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900 sm:inline-block dark:bg-amber-900/80 dark:text-amber-200">
              Auto-Reconnecting
            </span>
          </aside>
        )}

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-3 sm:p-6 lg:p-8 focus:outline-none"
        >
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
