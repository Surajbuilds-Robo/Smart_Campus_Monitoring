import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("Comprehensive Responsive Design & Device Adaptation Audit", () => {
  const rootDir = path.resolve(__dirname, "..");
  const srcDir = path.resolve(rootDir, "src");

  it("verifies global CSS has mobile-first responsive foundation and overflow protection", () => {
    const cssPath = path.resolve(srcDir, "index.css");
    const content = fs.readFileSync(cssPath, "utf8");

    assert.ok(content.includes("overflow-x: hidden"), "Global body must enforce overflow-x: hidden");
    assert.ok(content.includes("min-width: 320px"), "Global html and body must support 320px minimum viewport width");
    assert.ok(content.includes("100dvh"), "Global layout must support 100dvh dynamic viewport height");
    assert.ok(content.includes("touch-action: manipulation"), "Buttons and links must have touch-action manipulation for fast mobile taps");
    assert.ok(content.includes(".no-scrollbar"), "Global CSS must provide .no-scrollbar utility for horizontal tab bars");
  });

  it("verifies Topbar adapts to 320px-430px mobile viewports without search or dropdown blowout", () => {
    const topbarPath = path.resolve(srcDir, "layout/Topbar.jsx");
    const content = fs.readFileSync(topbarPath, "utf8");

    // Responsive search width
    assert.ok(
      content.includes("w-24") && content.includes("xs:w-36") && content.includes("sm:w-60"),
      "Search input must dynamically scale width across mobile viewports (w-24 xs:w-36 sm:w-60)"
    );

    // Dropdown horizontal boundaries
    assert.ok(
      content.includes("max-w-[calc(100vw-1.5rem)]") || content.includes("w-[calc(100vw-1.5rem)]"),
      "Notification and profile dropdowns must be constrained to viewport width on small screens"
    );

    // YouTube-style pill shape preserved
    assert.ok(content.includes("rounded-l-full"), "Search input must preserve rounded-l-full");
    assert.ok(content.includes("rounded-r-full"), "Search button must preserve rounded-r-full");
  });

  it("verifies DashboardLayout applies responsive padding and isolated vertical scroll", () => {
    const layoutPath = path.resolve(srcDir, "layout/DashboardLayout.jsx");
    const content = fs.readFileSync(layoutPath, "utf8");

    assert.ok(
      content.includes("p-3 sm:p-6 lg:p-8"),
      "DashboardLayout main container must apply responsive padding (p-3 on mobile, sm:p-6, lg:p-8)"
    );
    assert.ok(
      content.includes("overflow-y-auto") && content.includes("overflow-x-hidden"),
      "Main content area must maintain isolated vertical scroll without horizontal blowout"
    );
  });

  it("verifies Sidebar provides desktop collapse and full mobile drawer slide-out with backdrop", () => {
    const sidebarPath = path.resolve(srcDir, "layout/Sidebar.jsx");
    const content = fs.readFileSync(sidebarPath, "utf8");

    assert.ok(content.includes("lg:static"), "Sidebar must be static beside main content on desktop");
    assert.ok(content.includes("-translate-x-full lg:translate-x-0"), "Sidebar must hide offscreen on mobile and slide in");
    assert.ok(content.includes("backdrop-blur-xs"), "Mobile drawer backdrop must blur background content");
    assert.ok(content.includes("Escape"), "Sidebar must close on Escape key press");
  });

  it("verifies CCTV VideoPlayer adapts controls, aspect ratio, and overlays on mobile viewports", () => {
    const playerPath = path.resolve(srcDir, "features/cameras/VideoPlayer.jsx");
    const content = fs.readFileSync(playerPath, "utf8");

    assert.ok(content.includes("flex-wrap"), "VideoPlayer top overlay must support flex-wrap on narrow viewports");
    assert.ok(
      content.includes("hidden xs:inline-block") || content.includes("hidden sm:inline-block"),
      "VideoPlayer volume slider must hide on 320px screens to prevent control crowding"
    );
    assert.ok(content.includes("aspect-video") || content.includes("object-contain"), "Video must preserve aspect ratio");
  });

  it("verifies AIAnalysisPanel stacks vertically on mobile and collapses to bottom bar", () => {
    const panelPath = path.resolve(srcDir, "features/cameras/AIAnalysisPanel.jsx");
    const content = fs.readFileSync(panelPath, "utf8");

    assert.ok(
      content.includes("border-t lg:border-t-0 lg:border-l"),
      "AIAnalysisPanel must use top border on mobile and left border on desktop"
    );
    assert.ok(
      content.includes("max-h-[42vh] lg:max-h-none"),
      "AIAnalysisPanel must limit maximum height to 42vh on mobile to preserve video visibility"
    );
    assert.ok(
      content.includes("w-full lg:w-12"),
      "AIAnalysisPanel collapsed state must stretch across mobile width as bottom bar"
    );
  });

  it("verifies CameraDetailModal supports mobile screen heights with 96dvh and touch padding", () => {
    const modalPath = path.resolve(srcDir, "features/cameras/CameraDetailModal.jsx");
    const content = fs.readFileSync(modalPath, "utf8");

    assert.ok(content.includes("h-[96dvh]"), "CameraDetailModal must use 96dvh on mobile");
    assert.ok(content.includes("flex-wrap sm:flex-nowrap"), "CameraDetailModal header must wrap gracefully on small phones");
  });

  it("verifies Dashboard KPI cards, Donut chart, incidents, and quick actions adapt to mobile", () => {
    const dashPath = path.resolve(srcDir, "pages/Dashboard.jsx");
    const content = fs.readFileSync(dashPath, "utf8");

    assert.ok(content.includes("grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"), "KPI cards must use 1 column on mobile, 2 on tablet, 4 on desktop");
    assert.ok(content.includes("flex-col xs:flex-row"), "Parking occupancy donut chart must stack on small screens");
    assert.ok(
      content.includes("grid-cols-1 xs:grid-cols-2 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2"),
      "Quick Actions grid must adapt without text truncation"
    );
  });

  it("verifies Data Tables in Incidents and Users are wrapped in scrollable containers with minimum column widths", () => {
    const incidentsPath = path.resolve(srcDir, "pages/Incidents.jsx");
    const usersPath = path.resolve(srcDir, "pages/Users.jsx");

    const incidentsContent = fs.readFileSync(incidentsPath, "utf8");
    const usersContent = fs.readFileSync(usersPath, "utf8");

    assert.ok(incidentsContent.includes("overflow-x-auto"), "Incidents table must have overflow-x-auto");
    assert.ok(incidentsContent.includes("min-w-[700px]"), "Incidents table must have min-w-[700px] to prevent column squishing");

    assert.ok(usersContent.includes("overflow-x-auto"), "Users table must have overflow-x-auto");
    assert.ok(usersContent.includes("min-w-[760px]"), "Users table must have min-w-[760px] to prevent column squishing");
  });

  it("verifies all Modals (Incidents, Users, Camera, Change Password) have scrollable max-heights", () => {
    const incidentsPath = path.resolve(srcDir, "pages/Incidents.jsx");
    const usersPath = path.resolve(srcDir, "pages/Users.jsx");
    const regCamPath = path.resolve(srcDir, "features/cameras/RegisterCameraModal.jsx");
    const changePassPath = path.resolve(srcDir, "layout/ChangePasswordModal.jsx");

    assert.ok(fs.readFileSync(incidentsPath, "utf8").includes("max-h-[92dvh] overflow-y-auto"));
    assert.ok(fs.readFileSync(usersPath, "utf8").includes("max-h-[90dvh] overflow-y-auto"));
    assert.ok(fs.readFileSync(regCamPath, "utf8").includes("max-h-[90dvh]") && fs.readFileSync(regCamPath, "utf8").includes("overflow-y-auto"));
    assert.ok(fs.readFileSync(changePassPath, "utf8").includes("max-h-[90dvh] overflow-y-auto"));
  });

  it("verifies filter bars across Parking, Crowd, and Resources are horizontally scrollable without clipping", () => {
    const parkingPath = path.resolve(srcDir, "pages/Parking.jsx");
    const crowdPath = path.resolve(srcDir, "pages/Crowd.jsx");
    const resourcesPath = path.resolve(srcDir, "pages/Resources.jsx");

    assert.ok(fs.readFileSync(parkingPath, "utf8").includes("overflow-x-auto no-scrollbar max-w-full"));
    assert.ok(fs.readFileSync(crowdPath, "utf8").includes("overflow-x-auto no-scrollbar max-w-full"));
    assert.ok(fs.readFileSync(resourcesPath, "utf8").includes("overflow-x-auto no-scrollbar max-w-full"));
  });

  it("verifies Login card is mobile-friendly with responsive padding and dynamic viewport height", () => {
    const loginPath = path.resolve(srcDir, "pages/Login.jsx");
    const content = fs.readFileSync(loginPath, "utf8");

    assert.ok(content.includes("min-h-dvh"), "Login page must use min-h-dvh");
    assert.ok(content.includes("p-6") && content.includes("sm:p-10"), "Login card must use p-6 on mobile and sm:p-10 on desktop");
  });
});
