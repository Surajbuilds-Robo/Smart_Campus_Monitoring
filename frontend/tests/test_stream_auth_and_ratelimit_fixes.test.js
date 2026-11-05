import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");

describe("Bug Fix Regression Suite — Vite HMR, Stream Auth, Rate Limiting & Meta Tags", () => {
  it("1. verifies index.html specifies standard mobile-web-app-capable meta tag", () => {
    const htmlPath = path.join(frontendRoot, "index.html");
    const content = fs.readFileSync(htmlPath, "utf8");
    assert.ok(
      content.includes('<meta name="mobile-web-app-capable" content="yes" />') ||
      content.includes('<meta name="mobile-web-app-capable" content="yes">'),
      "index.html must include standard mobile-web-app-capable meta tag"
    );
    assert.ok(
      content.includes("apple-mobile-web-app-capable"),
      "index.html must preserve apple-specific tag for iOS compatibility"
    );
  });

  it("2. verifies public/sw.js bypasses Vite HMR development modules and tokens", () => {
    const swPath = path.join(frontendRoot, "public/sw.js");
    const content = fs.readFileSync(swPath, "utf8");
    assert.ok(content.includes("@vite"), "sw.js must bypass @vite modules");
    assert.ok(content.includes("token"), "sw.js must bypass tokenized queries");
    assert.ok(content.includes("ticket"), "sw.js must bypass ticketed stream queries");
  });

  it("3. verifies serviceWorkerRegistration unregisters during development", () => {
    const swRegPath = path.join(frontendRoot, "src/utils/serviceWorkerRegistration.js");
    const content = fs.readFileSync(swRegPath, "utf8");
    assert.ok(
      content.includes("import.meta.env?.DEV") || content.includes("import.meta.env.DEV"),
      "Must check for development environment"
    );
    assert.ok(
      content.includes("unregisterServiceWorker"),
      "Must unregister service worker in development to avoid stale HMR token cache"
    );
  });

  it("4. verifies vite.config.js configures HMR clientPort 5173", () => {
    const viteConfigPath = path.join(frontendRoot, "vite.config.js");
    const content = fs.readFileSync(viteConfigPath, "utf8");
    assert.ok(content.includes("hmr"), "vite.config.js must configure server.hmr");
    assert.ok(content.includes("clientPort: 5173"), "vite.config.js must specify clientPort: 5173");
  });

  it("5. verifies campusApi exposes getStreamTicket client contract", () => {
    const campusApiPath = path.join(frontendRoot, "src/services/campusApi.js");
    const content = fs.readFileSync(campusApiPath, "utf8");
    assert.ok(content.includes("getStreamTicket:"), "campusApi must export getStreamTicket");
    assert.ok(content.includes("/stream-ticket"), "getStreamTicket must query /stream-ticket endpoint");
  });

  it("6. verifies useOnClickFetch implements stable callback and in-flight deduplication", () => {
    const hookPath = path.join(frontendRoot, "src/hooks/useOnClickFetch.js");
    const content = fs.readFileSync(hookPath, "utf8");
    assert.ok(content.includes("inFlightRef"), "Must track inFlightRef for contract test compliance");
    assert.ok(content.includes("inFlightPromiseRef"), "Must share in-flight promises to deduplicate concurrent requests");
    assert.ok(content.includes("retryAfter"), "Must track retryAfter on HTTP 429");
  });

  it("7. verifies CameraDetailModal guards telemetry effect against re-fetch loops", () => {
    const modalPath = path.join(frontendRoot, "src/features/cameras/CameraDetailModal.jsx");
    const content = fs.readFileSync(modalPath, "utf8");
    assert.ok(content.includes("lastLoadedIdRef"), "Must track lastLoadedIdRef to prevent infinite effect re-triggering");
  });

  it("8. verifies VideoPlayer attaches stream ticket and safely degrades MJPEG feed", () => {
    const playerPath = path.join(frontendRoot, "src/features/cameras/VideoPlayer.jsx");
    const content = fs.readFileSync(playerPath, "utf8");
    assert.ok(content.includes("streamTicket"), "VideoPlayer must support streamTicket on streamInfo");
    assert.ok(content.includes("ticket="), "VideoPlayer must attach ticket to MJPEG URL parameters");
  });

  it("9. verifies CameraTile uses getStreamTicket on proxy fallback", () => {
    const tilePath = path.join(frontendRoot, "src/features/cameras/CameraTile.jsx");
    const content = fs.readFileSync(tilePath, "utf8");
    assert.ok(content.includes("cameraApi.getStreamTicket"), "CameraTile must obtain stream ticket when falling back to proxy");
  });
});
