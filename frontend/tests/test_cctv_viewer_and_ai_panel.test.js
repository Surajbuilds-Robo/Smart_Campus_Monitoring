import { test, describe } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Step 2 — Real-Time CCTV Viewer with Collapsible AI Analysis Panel", () => {
  const camerasDir = path.resolve(__dirname, "../src/features/cameras");

  test("verifies required modular components exist on disk", () => {
    const requiredFiles = [
      "VideoPlayer.jsx",
      "AIAnalysisPanel.jsx",
      "CameraDetailModal.jsx",
      "CameraTile.jsx",
      "CameraGrid.jsx",
      "DisconnectedOverlay.jsx",
      "index.js",
    ];

    for (const file of requiredFiles) {
      assert.ok(
        fs.existsSync(path.join(camerasDir, file)),
        `Component ${file} must exist in features/cameras/`
      );
    }
  });

  test("verifies VideoPlayer supports multi-protocol HLS and honest live states", () => {
    const playerPath = path.join(camerasDir, "VideoPlayer.jsx");
    const content = fs.readFileSync(playerPath, "utf8");

    // HLS.js streaming support
    assert.ok(content.includes("Hls"), "VideoPlayer must integrate HLS stream handling");
    assert.ok(content.includes("Hls.isSupported()"), "VideoPlayer must check Hls.isSupported");

    // Prominent LIVE indicator
    assert.ok(content.includes("LIVE"), "VideoPlayer must render a prominent LIVE indicator");

    // Honest disconnected state string
    assert.ok(
      content.includes("Camera disconnected — footage unavailable"),
      "VideoPlayer must render exact message: 'Camera disconnected — footage unavailable'"
    );

    // No fake timeline seeking for live-only streams
    assert.ok(
      content.includes("TIMELINE SEEKING DISABLED (NO DVR BUFFER)") ||
        content.includes("dvrSupported"),
      "VideoPlayer must restrict seeking strictly to streams with verified DVR buffers"
    );
  });

  test("verifies AIAnalysisPanel provides collapsible view and honest empty states", () => {
    const panelPath = path.join(camerasDir, "AIAnalysisPanel.jsx");
    const content = fs.readFileSync(panelPath, "utf8");

    // Collapsible structure
    assert.ok(content.includes("collapsed"), "Panel must accept collapsed prop");
    assert.ok(content.includes("onToggleCollapse"), "Panel must support collapse toggle");

    // Honest AI offline status
    assert.ok(
      content.includes("AI analysis unavailable"),
      "Panel must render 'AI analysis unavailable' when inference service is offline"
    );

    // Socket.io real-time listeners for authorized updates
    assert.ok(content.includes("occupancy:updated"), "Panel must listen for occupancy:updated");
    assert.ok(content.includes("incident:created"), "Panel must listen for incident:created");
  });

  test("verifies CameraDetailModal integrates VideoPlayer and AIAnalysisPanel side-by-side", () => {
    const modalPath = path.join(camerasDir, "CameraDetailModal.jsx");
    const content = fs.readFileSync(modalPath, "utf8");

    assert.ok(content.includes("<VideoPlayer"), "Modal must render VideoPlayer");
    assert.ok(content.includes("<AIAnalysisPanel"), "Modal must render AIAnalysisPanel");
    assert.ok(content.includes("panelCollapsed"), "Modal must manage panel collapse state");
    assert.ok(
      content.includes("cameraApi.getStream"),
      "Modal must query on-demand stream descriptor"
    );
    assert.ok(
      content.includes("cameraApi.getAnalytics"),
      "Modal must query genuine camera analytics"
    );
  });

  test("verifies CameraTile provides lightweight preview and opens CCTV viewer", () => {
    const tilePath = path.join(camerasDir, "CameraTile.jsx");
    const content = fs.readFileSync(tilePath, "utf8");

    assert.ok(
      content.includes("CameraPreview"),
      "CameraTile must define lightweight CameraPreview"
    );
    assert.ok(
      content.includes("IntersectionObserver"),
      "CameraTile preview must pause/release resources when out of view"
    );
    assert.ok(
      content.includes("onInspect"),
      "CameraTile must trigger viewer inspect modal on card click"
    );
  });

  test("verifies cameraApi client exposes getStream and getAnalytics contracts", () => {
    const apiPath = path.resolve(__dirname, "../src/services/campusApi.js");
    const content = fs.readFileSync(apiPath, "utf8");

    assert.ok(content.includes("getStream:"), "campusApi must export getStream");
    assert.ok(content.includes("getAnalytics:"), "campusApi must export getAnalytics");
  });
});
