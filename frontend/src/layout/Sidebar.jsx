import { useState, useEffect } from "react";
import { NavLink } from "react-router-dom";
import {
  Home,
  Video,
  CarFront,
  Users,
  Landmark,
  AlertTriangle,
  ShieldCheck,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import constants from "../../../shared/constants.json";

const { roles } = constants;

const primaryNavigation = [
  {
    label: "Dashboard",
    path: "/dashboard",
    icon: Home,
    roles: [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
  },
  {
    label: "Parking",
    path: "/parking",
    icon: CarFront,
    roles: [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
  },
  {
    label: "Crowd / Occupancy",
    path: "/crowd",
    icon: Users,
    roles: [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
  },
  {
    label: "Resources",
    path: "/resources",
    icon: Landmark,
    roles: [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY, roles.STUDENT],
  },
  {
    label: "Incidents",
    path: "/incidents",
    icon: AlertTriangle,
    roles: [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY],
  },
  {
    label: "Cameras",
    path: "/cameras",
    icon: Video,
    roles: [roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY],
  },
];

const secondaryNavigation = [
  {
    label: "User Management",
    path: "/users",
    icon: ShieldCheck,
    roles: [roles.SUPER_ADMIN, roles.DEPT_HEAD],
  },
];

export default function Sidebar({
  user: userProp,
  collapsed = false,
  onToggleCollapse,
  mobileOpen = false,
  open: legacyOpen,
  onClose,
}) {
  const auth = useAuth();
  const user = userProp !== undefined ? userProp : auth.user;
  const role = user?.role;

  // Resolve state handling legacyOpen fallback if supplied
  const isCollapsed = Boolean(
    collapsed !== undefined ? collapsed : legacyOpen !== undefined ? !legacyOpen : false
  );
  const isMobileOpen = Boolean(
    mobileOpen !== undefined ? mobileOpen : legacyOpen !== undefined ? legacyOpen : false
  );

  const [tooltip, setTooltip] = useState(null);

  const visiblePrimary = primaryNavigation.filter((item) =>
    role ? item.roles.includes(role) : false
  );

  const visibleSecondary = secondaryNavigation.filter((item) =>
    role ? item.roles.includes(role) : false
  );

  // Close on Escape key press when mobile sidebar is open
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && isMobileOpen && typeof onClose === "function") {
        onClose();
      }
    }

    if (isMobileOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isMobileOpen, onClose]);

  const handleNavClick = () => {
    setTooltip(null);
    if (typeof window !== "undefined" && window.innerWidth < 1024 && typeof onClose === "function") {
      onClose();
    }
  };

  const handleItemHoverOrFocus = (e, label) => {
    if (isCollapsed) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        text: label,
        top: rect.top + rect.height / 2,
      });
    }
  };

  const handleItemLeaveOrBlur = () => {
    setTooltip(null);
  };

  const renderNavItem = (item) => {
    const Icon = item.icon;

    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={handleNavClick}
        onMouseEnter={(e) => handleItemHoverOrFocus(e, item.label)}
        onMouseLeave={handleItemLeaveOrBlur}
        onFocus={(e) => handleItemHoverOrFocus(e, item.label)}
        onBlur={handleItemLeaveOrBlur}
        title={isCollapsed ? item.label : undefined}
        className={({ isActive }) =>
          `group relative flex items-center rounded-xl font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B26262] ${
            isCollapsed
              ? "gap-3 px-3.5 py-3 text-sm min-h-[44px] lg:gap-0 lg:px-0 lg:py-0 lg:h-12 lg:w-12 lg:mx-auto lg:justify-center"
              : "gap-3.5 px-3.5 py-2.5 text-sm min-h-[44px]"
          } ${
            isActive
              ? "bg-[#F6EDED] font-semibold text-[#B26262] shadow-xs border-r-2 border-[#B26262]"
              : "text-[#806B6A] hover:bg-[#F0E3E3] hover:text-[#3C1414]"
          }`
        }
      >
        {({ isActive }) => (
          <>
            <Icon
              size={20}
              className={`shrink-0 transition-colors ${
                isActive
                  ? "text-[#B26262]"
                  : "text-[#806B6A] group-hover:text-[#3C1414]"
              }`}
            />
            <span
              className={`truncate ${
                isActive
                  ? "text-[#B26262] font-semibold"
                  : "text-[#806B6A] group-hover:text-[#3C1414]"
              } ${isCollapsed ? "text-sm lg:hidden" : "text-sm"}`}
            >
              {item.label}
            </span>
          </>
        )}
      </NavLink>
    );
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isMobileOpen && (
        <div
          role="presentation"
          aria-hidden="true"
          onClick={onClose}
          className="fixed inset-0 z-40 bg-[#3C1414]/40 backdrop-blur-xs transition-opacity duration-300 lg:hidden"
        />
      )}

      {/* Modern Fixed Full-Height Sidebar with Collapsed & Expanded Modes */}
      <aside
        id="main-sidebar"
        aria-label="Main navigation"
        className={`fixed inset-y-0 left-0 z-50 flex h-full shrink-0 flex-col border-r border-[#E5D6D6] bg-white text-[#3C1414] transition-all duration-300 ease-in-out lg:static ${
          isMobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${isCollapsed ? "w-64 lg:w-20" : "w-64"}`}
      >
        {/* Sidebar Header with Collapse / Expand & Mobile Controls */}
        <div
          className={`flex h-16 shrink-0 items-center border-b border-[#E5D6D6] transition-all duration-300 ${
            isCollapsed ? "justify-between px-4 lg:justify-center lg:px-2" : "justify-between px-4"
          }`}
        >
          {/* Institutional Branding Title (No duplicate logo here; logo is in Topbar) */}
          <div
            className={`min-w-0 transition-opacity duration-200 ${
              isCollapsed ? "block lg:hidden" : "block"
            }`}
          >
            <p className="truncate text-sm font-bold tracking-tight text-[#3C1414]">
              Smart Campus
            </p>
            <p className="truncate text-xs font-medium text-[#806B6A]">
              Monitoring
            </p>
          </div>

          {/* Desktop Expand Button when in Collapsed Mode (Position 1 at the top of the sidebar) */}
          {isCollapsed && (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label="Expand sidebar"
              title="Expand sidebar"
              className="hidden h-10 w-10 items-center justify-center rounded-xl text-[#806B6A] transition hover:bg-[#F0E3E3] hover:text-[#3C1414] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 active:scale-95 lg:flex"
            >
              <PanelLeftOpen size={20} />
            </button>
          )}

          {/* Consistent Sidebar Collapse Button (Replaces inappropriate X close button) */}
          <button
            type="button"
            onClick={() => {
              if (typeof onToggleCollapse === "function") onToggleCollapse();
              if (typeof onClose === "function") onClose();
            }}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            className={`h-9 w-9 items-center justify-center rounded-xl text-[#806B6A] transition hover:bg-[#F0E3E3] hover:text-[#3C1414] focus:outline-none focus:ring-2 focus:ring-[#B26262]/20 active:scale-95 ${
              isCollapsed ? "flex lg:hidden" : "flex"
            }`}
          >
            <PanelLeftClose size={19} />
            <span className="sr-only" aria-label="Close sidebar">Close sidebar</span>
          </button>
        </div>

        {/* Navigation List - Scrolls internally without moving the sidebar container */}
        <nav
          className="flex-1 space-y-1.5 overflow-y-auto px-2 py-3"
          aria-label="Sidebar sections"
          onScroll={() => setTooltip(null)}
        >
          {visiblePrimary.map(renderNavItem)}

          {/* Thin horizontal divider below Cameras with balanced margins */}
          {visibleSecondary.length > 0 && (
            <div
              className={`my-3 border-t border-[#E5D6D6] ${
                isCollapsed ? "mx-2 lg:mx-3" : "mx-3"
              }`}
            />
          )}

          {visibleSecondary.map(renderNavItem)}
        </nav>

        {/* Floating Accessible Tooltip for Collapsed Mode (Guaranteed zero clipping) */}
        {isCollapsed && tooltip && (
          <div
            role="tooltip"
            style={{ top: `${tooltip.top}px`, left: "88px" }}
            className="fixed z-50 hidden -translate-y-1/2 pointer-events-none rounded-lg bg-[#3C1414] px-3 py-1.5 text-xs font-semibold text-white shadow-xl ring-1 ring-[#3C1414]/30 transition-opacity lg:block"
          >
            {tooltip.text}
          </div>
        )}

        {/* Fixed Lower Section: Campus Safety Monitoring System Branding */}
        <div className="shrink-0 border-t border-[#E5D6D6] bg-white p-3">
          {/* Desktop Collapsed Rail Mode: Centered Shield Icon Tile */}
          <div className="hidden lg:flex lg:justify-center">
            {isCollapsed && (
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B26262] text-white shadow-xs transition hover:bg-[#9E5353]"
                title="Campus Safety Monitoring System"
              >
                <ShieldCheck size={20} />
              </div>
            )}
          </div>

          {/* Expanded Desktop & Mobile Drawer Mode: Clean card with 12px gap between icon and text */}
          <div
            className={`flex items-center gap-3 rounded-xl border border-[#E5D6D6] bg-[#F6EDED] p-2.5 transition-all ${
              isCollapsed ? "lg:hidden" : "flex"
            }`}
          >
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B26262] text-white shadow-xs transition hover:bg-[#9E5353]"
              title="Campus Safety Monitoring System"
            >
              <ShieldCheck size={20} />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold leading-tight text-[#3C1414]">
                Campus Safety
              </p>
              <p className="truncate text-[11px] font-medium leading-tight text-[#806B6A]">
                Monitoring System
              </p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
