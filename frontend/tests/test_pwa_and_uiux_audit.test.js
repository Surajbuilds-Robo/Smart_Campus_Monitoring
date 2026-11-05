import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import constants from "../../shared/constants.json" with { type: "json" };
import {
  canAccessPath,
  canViewEvidence,
  canManageUsers,
  canManageIncidents,
  getVisibleNavigation,
  navigationItems,
} from "../src/utils/rolePermissions.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("UI/UX Audit & PWA Implementation Verification", () => {
  const { roles } = constants;

  describe("A. System-Driven Theme Contract", () => {
    it("verifies theme synchronizer file exists and exports initThemeListener", () => {
      const themePath = path.resolve(__dirname, "../src/utils/theme.js");
      assert.ok(fs.existsSync(themePath), "theme.js utility must exist");
      const content = fs.readFileSync(themePath, "utf8");
      assert.ok(
        content.includes("initThemeListener"),
        "Must export initThemeListener function"
      );
      assert.ok(
        content.includes("prefers-color-scheme: dark"),
        "Must listen to prefers-color-scheme: dark"
      );
    });

    it("verifies index.html has pre-hydration script to avoid theme flash", () => {
      const htmlPath = path.resolve(__dirname, "../index.html");
      const html = fs.readFileSync(htmlPath, "utf8");
      assert.ok(
        html.includes("prefers-color-scheme: dark"),
        "index.html must include inline theme pre-hydration"
      );
      assert.ok(
        html.includes("classList.add('dark')"),
        "Must add .dark class when OS preference is dark"
      );
    });
  });

  describe("B. Navigation & Permissions Foundation", () => {
    it("verifies all five main operational sections exist in navigation", () => {
      const requiredSections = [
        "/cameras",
        "/parking",
        "/crowd",
        "/resources",
        "/incidents",
      ];
      for (const sec of requiredSections) {
        assert.ok(
          navigationItems.some((i) => i.path === sec),
          `Section ${sec} must be present in navigation items`
        );
      }
    });

    it("verifies role-based navigation filtering matches strict contracts", () => {
      // Super Admin: 8 operational items (Settings retired)
      assert.equal(getVisibleNavigation(roles.SUPER_ADMIN).length, 8);
      assert.equal(canAccessPath(roles.SUPER_ADMIN, "/settings"), false);

      // Dept Head: 8 items (includes users, cameras, incidents)
      assert.equal(getVisibleNavigation(roles.DEPT_HEAD).length, 8);
      assert.ok(canManageUsers(roles.DEPT_HEAD));

      // Faculty: 7 items (no users)
      assert.equal(getVisibleNavigation(roles.FACULTY).length, 7);
      assert.equal(canManageUsers(roles.FACULTY), false);
      assert.ok(canAccessPath(roles.FACULTY, "/cameras"));
      assert.ok(canAccessPath(roles.FACULTY, "/incidents"));

      // Student: 5 items (public only; cameras, incidents, users, settings forbidden)
      const studentNav = getVisibleNavigation(roles.STUDENT);
      assert.equal(studentNav.length, 5);
      assert.equal(canAccessPath(roles.STUDENT, "/cameras"), false);
      assert.equal(canAccessPath(roles.STUDENT, "/incidents"), false);
      assert.equal(canAccessPath(roles.STUDENT, "/users"), false);
      assert.equal(canAccessPath(roles.STUDENT, "/settings"), false);
      assert.equal(canManageIncidents(roles.STUDENT), false);
      assert.ok(canManageIncidents(roles.FACULTY));
    });

    it("verifies YouTube-style collapsible sidebar implementation", () => {
      const sidebarPath = path.resolve(__dirname, "../src/layout/Sidebar.jsx");
      const content = fs.readFileSync(sidebarPath, "utf8");
      assert.ok(content.includes("lg:static"), "Must preserve layout without breaking main content");
      assert.ok(content.includes("w-64"), "Must have expanded width");
      assert.ok(content.includes("lg:w-20"), "Must have mini rail width for collapsed mode");
    });
  });

  describe("C. On-Demand Fetching & Error States", () => {
    it("verifies useOnClickFetch hook exists on disk", () => {
      const hookPath = path.resolve(__dirname, "../src/hooks/useOnClickFetch.js");
      assert.ok(fs.existsSync(hookPath), "useOnClickFetch.js must exist");
      const content = fs.readFileSync(hookPath, "utf8");
      assert.ok(content.includes("execute"), "Must provide execute function");
      assert.ok(content.includes("retry"), "Must provide retry function");
      assert.ok(content.includes("inFlightRef"), "Must deduplicate in-flight requests");
    });

    it("verifies ErrorState component exists with accessible semantics", () => {
      const errorStatePath = path.resolve(__dirname, "../src/components/ui/ErrorState.jsx");
      assert.ok(fs.existsSync(errorStatePath), "ErrorState.jsx must exist");
      const content = fs.readFileSync(errorStatePath, "utf8");
      assert.ok(content.includes('role="alert"'), "Must implement role=alert");
      assert.ok(content.includes("onRetry"), "Must support onRetry callback");
    });
  });

  describe("D. Camera Modular Views & Disconnected UX", () => {
    const camerasDir = path.resolve(__dirname, "../src/features/cameras");

    it("verifies all modular camera components exist on disk", () => {
      const required = [
        "CameraGrid.jsx",
        "CameraTile.jsx",
        "CameraDetailModal.jsx",
        "DisconnectedOverlay.jsx",
        "index.js",
      ];
      for (const file of required) {
        assert.ok(
          fs.existsSync(path.join(camerasDir, file)),
          `Modular camera file ${file} must exist in features/cameras`
        );
      }
    });

    it("verifies exact disconnected message string in DisconnectedOverlay", () => {
      const overlayPath = path.join(camerasDir, "DisconnectedOverlay.jsx");
      const content = fs.readFileSync(overlayPath, "utf8");
      assert.ok(
        content.includes("Camera is Disconnected / Footage Not Available"),
        "Must contain the exact required string: 'Camera is Disconnected / Footage Not Available'"
      );
    });

    it("verifies transient camera status debouncing in Cameras page", () => {
      const camerasPagePath = path.resolve(__dirname, "../src/pages/Cameras.jsx");
      const content = fs.readFileSync(camerasPagePath, "utf8");
      assert.ok(
        content.includes("debounceTimerRef"),
        "Cameras page must debounce rapid status changes"
      );
      assert.ok(
        content.includes("wasConnectedRef"),
        "Cameras page must reconcile updates after reconnection"
      );
    });
  });

  describe("E. Incident & Evidence Privacy Boundaries", () => {
    it("verifies student role is strictly forbidden from incident evidence", () => {
      assert.equal(
        canViewEvidence(roles.STUDENT),
        false,
        "Students must never be authorized to view evidence"
      );
      assert.equal(canViewEvidence(roles.FACULTY), true);
      assert.equal(canViewEvidence(roles.DEPT_HEAD), true);
      assert.equal(canViewEvidence(roles.SUPER_ADMIN), true);
    });

    it("verifies EvidenceViewer component protects privacy", () => {
      const viewerPath = path.resolve(__dirname, "../src/features/incidents/EvidenceViewer.jsx");
      assert.ok(fs.existsSync(viewerPath), "EvidenceViewer.jsx must exist");
      const content = fs.readFileSync(viewerPath, "utf8");
      assert.ok(
        content.includes("canViewEvidence"),
        "Must verify authorization before rendering evidence"
      );
      assert.ok(
        content.includes("toUTCString()"),
        "Must render UTC timestamps when evidence exists"
      );
    });

    it("verifies UnauthorizedPage exists with return to dashboard action", () => {
      const unauthorizedPath = path.resolve(__dirname, "../src/pages/UnauthorizedPage.jsx");
      assert.ok(fs.existsSync(unauthorizedPath), "UnauthorizedPage.jsx must exist");
      const mainPath = path.resolve(__dirname, "../src/pages/Unauthorized.jsx");
      const content = fs.readFileSync(mainPath, "utf8");
      assert.ok(content.includes('to="/dashboard"'), "Must link back to dashboard");
    });
  });

  describe("F. Progressive Web App (PWA) Foundation", () => {
    const publicDir = path.resolve(__dirname, "../public");

    it("verifies web manifest exists with standalone display and icons", () => {
      const manifestPath = path.join(publicDir, "manifest.webmanifest");
      assert.ok(fs.existsSync(manifestPath), "manifest.webmanifest must exist");

      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      assert.equal(manifest.display, "standalone");
      assert.ok(manifest.icons.length >= 2, "Must declare at least two icon sizes");
      assert.ok(manifest.icons.some((i) => i.sizes === "192x192"));
      assert.ok(manifest.icons.some((i) => i.sizes === "512x512"));
    });

    it("verifies PWA icon assets exist on disk", () => {
      assert.ok(fs.existsSync(path.join(publicDir, "icons/icon-192.png")));
      assert.ok(fs.existsSync(path.join(publicDir, "icons/icon-512.png")));
      assert.ok(fs.existsSync(path.join(publicDir, "icons/icon.svg")));
    });

    it("verifies Service Worker bypasses sensitive APIs and protects evidence", () => {
      const swPath = path.join(publicDir, "sw.js");
      assert.ok(fs.existsSync(swPath), "sw.js must exist");

      const sw = fs.readFileSync(swPath, "utf8");
      assert.ok(
        sw.includes('/api/'),
        "Service worker must explicitly check and bypass /api/ routes"
      );
      assert.ok(
        sw.includes("socket.io"),
        "Service worker must bypass socket.io transports"
      );
      assert.ok(
        sw.includes("isSensitiveRequest"),
        "Service worker must include sensitive request guard"
      );
    });

    it("verifies usePWAInstall hook provides installation and iOS detection", () => {
      const pwaHookPath = path.resolve(__dirname, "../src/hooks/usePWAInstall.js");
      assert.ok(fs.existsSync(pwaHookPath), "usePWAInstall.js must exist");

      const content = fs.readFileSync(pwaHookPath, "utf8");
      assert.ok(content.includes("beforeinstallprompt"));
      assert.ok(content.includes("isIOS"));
      assert.ok(content.includes("promptInstall"));
    });
  });
});
