import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Sidebar Fixed Position & Collapsible Icon Mode Verification", () => {
  const layoutDir = path.resolve(__dirname, "../src/layout");
  const dashboardLayoutPath = path.join(layoutDir, "DashboardLayout.jsx");
  const sidebarPath = path.join(layoutDir, "Sidebar.jsx");
  const topbarPath = path.join(layoutDir, "Topbar.jsx");

  describe("1. Fixed Viewport Layout & Isolated Scrolling Architecture", () => {
    it("verifies DashboardLayout establishes full viewport-height container without window scrolling", () => {
      assert.ok(fs.existsSync(dashboardLayoutPath), "DashboardLayout.jsx must exist");
      const content = fs.readFileSync(dashboardLayoutPath, "utf8");

      // Root wrapper must use viewport-height layout and lock outer overflow
      assert.ok(
        content.includes("h-screen") && content.includes("overflow-hidden"),
        "Root layout container must declare h-screen and overflow-hidden to prevent body scrolling"
      );
      assert.ok(
        content.includes("h-dvh"),
        "Root layout container should support dynamic viewport height (h-dvh) for mobile devices"
      );
    });

    it("verifies main content area has dedicated vertical scrolling container", () => {
      const content = fs.readFileSync(dashboardLayoutPath, "utf8");
      assert.ok(
        content.includes("overflow-y-auto"),
        "Main content container must have overflow-y-auto so scrolling is isolated to the right pane"
      );
      assert.ok(
        content.includes("overflow-x-hidden"),
        "Main content area must declare overflow-x-hidden to prevent horizontal transition bleed"
      );
      assert.ok(
        content.includes("min-w-0"),
        "Main content area must use min-w-0 to prevent flex blowout on wide grids and tables"
      );
    });

    it("verifies Topbar stays pinned with sticky positioning in main content column", () => {
      const content = fs.readFileSync(topbarPath, "utf8");
      assert.ok(
        content.includes("sticky top-0"),
        "Topbar must have sticky top-0 to remain anchored during page scroll"
      );
    });
  });

  describe("2. Two Sidebar Modes & Expansion Architecture", () => {
    it("verifies Sidebar renders collapse button in expanded mode and expand button in collapsed mode", () => {
      assert.ok(fs.existsSync(sidebarPath), "Sidebar.jsx must exist");
      const content = fs.readFileSync(sidebarPath, "utf8");

      // Lucide collapse and expand icons
      assert.ok(
        content.includes("PanelLeftClose"),
        "Sidebar must import and render PanelLeftClose collapse trigger"
      );
      assert.ok(
        content.includes("PanelLeftOpen"),
        "Sidebar must import and render PanelLeftOpen expand trigger"
      );

      // Accessible labels
      assert.ok(
        content.includes('aria-label="Collapse sidebar"'),
        "Collapse button must declare aria-label='Collapse sidebar'"
      );
      assert.ok(
        content.includes('aria-label="Expand sidebar"'),
        "Expand button must declare aria-label='Expand sidebar'"
      );
    });

    it("verifies Sidebar width transitions between expanded (w-64) and mini-rail (lg:w-20)", () => {
      const content = fs.readFileSync(sidebarPath, "utf8");
      assert.ok(content.includes("w-64"), "Sidebar must define w-64 expanded width");
      assert.ok(content.includes("lg:w-20"), "Sidebar must define lg:w-20 collapsed icon rail width");
      assert.ok(
        content.includes("transition-all") && content.includes("duration-300"),
        "Sidebar must provide smooth transition-all duration-300 animation"
      );
    });

    it("verifies navigation labels are hidden on desktop when collapsed", () => {
      const content = fs.readFileSync(sidebarPath, "utf8");
      assert.ok(
        content.includes("isCollapsed ? \"text-sm lg:hidden\" : \"text-sm\""),
        "Navigation text labels must be hidden on desktop (lg:hidden) during collapsed mode"
      );
      assert.ok(
        content.includes("lg:justify-center"),
        "Navigation items must be centered in collapsed rail mode"
      );
    });

    it("verifies floating accessible tooltips are provided for collapsed icon mode", () => {
      const content = fs.readFileSync(sidebarPath, "utf8");
      assert.ok(
        content.includes('role="tooltip"'),
        "Collapsed icon hover/focus must display an unclipped tooltip with role='tooltip'"
      );
      assert.ok(
        content.includes("getBoundingClientRect()"),
        "Tooltip must calculate position dynamically using getBoundingClientRect"
      );
      assert.ok(
        content.includes("onFocus"),
        "Tooltip must support keyboard focus events for accessibility"
      );
    });
  });

  describe("3. Internal Navigation Scroll & Mobile Drawer Behavior", () => {
    it("verifies navigation list scrolls internally without moving sidebar frame", () => {
      const content = fs.readFileSync(sidebarPath, "utf8");
      assert.ok(
        content.includes("overflow-y-auto px-2 py-3"),
        "Navigation element must scroll internally (overflow-y-auto) when list exceeds viewport"
      );
    });

    it("verifies mobile drawer provides touch-friendly slide-over and backdrop overlay", () => {
      const content = fs.readFileSync(sidebarPath, "utf8");
      assert.ok(
        content.includes("lg:hidden"),
        "Backdrop overlay must be confined to mobile viewport"
      );
      assert.ok(
        content.includes("-translate-x-full lg:translate-x-0"),
        "Drawer must be hidden off-screen on mobile and static on desktop"
      );
      assert.ok(
        content.includes("aria-label=\"Close sidebar\""),
        "Mobile drawer must provide explicit close button with accessible label"
      );
    });
  });

  describe("4. State Management & Preference Persistence", () => {
    it("verifies sidebar collapse state is stored in localStorage", () => {
      const content = fs.readFileSync(dashboardLayoutPath, "utf8");
      assert.ok(
        content.includes("campus_sidebar_collapsed"),
        "DashboardLayout must persist collapsed state under 'campus_sidebar_collapsed' in localStorage"
      );
      assert.ok(
        content.includes("localStorage.getItem"),
        "DashboardLayout must initialize isCollapsed state from localStorage"
      );
      assert.ok(
        content.includes("localStorage.setItem"),
        "DashboardLayout must update localStorage when sidebar collapsed state is toggled"
      );
    });

    it("verifies unified Topbar menu trigger controls drawer on mobile and collapse on desktop", () => {
      const content = fs.readFileSync(dashboardLayoutPath, "utf8");
      assert.ok(
        content.includes("handleMenuClick"),
        "Must implement handleMenuClick handler"
      );
      assert.ok(
        content.includes("window.innerWidth < 1024"),
        "handleMenuClick must differentiate between mobile drawer toggle and desktop collapse toggle"
      );
    });
  });

  describe("5. Topbar Logo Position & Reordered Sidebar Navigation Alignment", () => {
    it("verifies Topbar renders blue university logo immediately to the left of the search input", () => {
      const topbarContent = fs.readFileSync(topbarPath, "utf8");
      assert.ok(
        topbarContent.includes("Landmark"),
        "Topbar must import and render the Landmark university logo"
      );
      assert.ok(
        topbarContent.includes('to="/dashboard"'),
        "Topbar logo must link to /dashboard"
      );
      assert.ok(
        topbarContent.includes("Search anything..."),
        "Topbar search input must maintain 'Search anything...' placeholder"
      );

      // Verify logo appears before the search input in the DOM
      const logoIndex = topbarContent.indexOf("<Landmark");
      const searchIndex = topbarContent.indexOf('placeholder="Search anything..."');
      assert.ok(logoIndex !== -1 && searchIndex !== -1, "Logo and search input must both exist");
      assert.ok(
        logoIndex < searchIndex,
        "Blue university logo must appear visually before (to the left of) the search input"
      );
    });

    it("verifies Sidebar header places collapse/expand controls at top without duplicate university logo", () => {
      const sidebarContent = fs.readFileSync(sidebarPath, "utf8");
      // Top header must NOT render duplicate Landmark logo
      assert.ok(
        !sidebarContent.includes("<Landmark"),
        "Sidebar must not contain a duplicate Landmark logo; it was moved to the Topbar"
      );

      // Top header controls
      assert.ok(
        sidebarContent.includes('aria-label="Expand sidebar"'),
        "Top of sidebar must render expand button when collapsed"
      );
      assert.ok(
        sidebarContent.includes('aria-label="Collapse sidebar"'),
        "Top of sidebar must render collapse button when expanded"
      );
    });

    it("verifies Dashboard/Home is the first item in the navigation sequence", () => {
      const sidebarContent = fs.readFileSync(sidebarPath, "utf8");
      const primaryNavMatch = sidebarContent.match(/const primaryNavigation = \[([\s\S]*?)\];/);
      assert.ok(primaryNavMatch, "primaryNavigation array must exist");
      const primaryNavText = primaryNavMatch[1];
      const dashboardIndex = primaryNavText.indexOf('"Dashboard"');
      const parkingIndex = primaryNavText.indexOf('"Parking"');
      assert.ok(dashboardIndex !== -1, "Dashboard must exist in primaryNavigation");
      assert.ok(parkingIndex !== -1, "Parking must exist in primaryNavigation");
      assert.ok(
        dashboardIndex < parkingIndex,
        "Dashboard must be positioned at the top of primary navigation"
      );
    });

    it("verifies User Management is in the lower navigation group and Settings has been retired", () => {
      const sidebarContent = fs.readFileSync(sidebarPath, "utf8");
      const secondaryNavMatch = sidebarContent.match(/const secondaryNavigation = \[([\s\S]*?)\];/);
      assert.ok(secondaryNavMatch, "secondaryNavigation array must exist");
      const secondaryNavText = secondaryNavMatch[1];
      assert.ok(
        secondaryNavText.includes('"User Management"'),
        "User Management must be in secondaryNavigation"
      );
      assert.equal(
        secondaryNavText.includes('"Settings"'),
        false,
        "Settings must NOT be in secondaryNavigation"
      );
    });

    it("verifies Campus Safety Monitoring System branding appears at the bottom and CO avatar is removed", () => {
      const sidebarContent = fs.readFileSync(sidebarPath, "utf8");
      // Campus Safety Monitoring System branding must appear in the lower fixed section
      assert.ok(
        sidebarContent.includes("Campus Safety"),
        "Sidebar must contain 'Campus Safety' branding"
      );
      assert.ok(
        sidebarContent.includes("Monitoring System"),
        "Sidebar must contain 'Monitoring System' branding text"
      );
      assert.ok(
        sidebarContent.includes('title="Campus Safety Monitoring System"'),
        "Sidebar branding must have title='Campus Safety Monitoring System'"
      );

      // CO avatar must be completely removed from sidebar
      assert.ok(
        !sidebarContent.includes("user?.profileImage || user?.avatar"),
        "User profile avatar must be removed from the sidebar"
      );
      assert.ok(
        !sidebarContent.includes("<span>{initials}</span>"),
        "Initials avatar must be removed from the sidebar"
      );
    });
  });
});
