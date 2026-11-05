import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendSrc = path.resolve(__dirname, "../src");

describe("Step 3 — Phone Camera Connection & Verification Contracts", () => {
  test("verifies RegisterCameraModal exists and has phone setup instructions", () => {
    const modalPath = path.join(frontendSrc, "features/cameras/RegisterCameraModal.jsx");
    assert.ok(fs.existsSync(modalPath), "RegisterCameraModal.jsx must exist");

    const content = fs.readFileSync(modalPath, "utf-8");
    assert.ok(content.includes("IP Webcam"), "Must reference IP Webcam for Android");
    assert.ok(content.includes("IP Camera Lite") || content.includes("DroidCam"), "Must reference iOS alternatives");
    assert.ok(content.includes("localhost"), "Must warn that localhost is not the phone IP");
    assert.ok(content.includes("cameraApi.verifyStream"), "Must support live reachability probe before save");
  });

  test("verifies features/cameras index exports RegisterCameraModal", () => {
    const indexPath = path.join(frontendSrc, "features/cameras/index.js");
    const content = fs.readFileSync(indexPath, "utf-8");
    assert.ok(content.includes("RegisterCameraModal"), "Must export RegisterCameraModal");
  });

  test("verifies Cameras.jsx renders Connect Phone trigger for authorized staff", () => {
    const pagePath = path.join(frontendSrc, "pages/Cameras.jsx");
    const content = fs.readFileSync(pagePath, "utf-8");
    assert.ok(content.includes("RegisterCameraModal"), "Cameras page must mount RegisterCameraModal");
    assert.ok(
      content.includes("canRegister") || content.includes("Connect Phone"),
      "Must have staff-guarded phone registration button"
    );
  });

  test("verifies VideoPlayer handles MJPEG streams and gateway proxy fallback", () => {
    const playerPath = path.join(frontendSrc, "features/cameras/VideoPlayer.jsx");
    const content = fs.readFileSync(playerPath, "utf-8");
    assert.ok(content.includes("isMjpeg"), "Must detect MJPEG stream format");
    assert.ok(content.includes("<img"), "Must render MJPEG via img element");
    assert.ok(
      content.includes("stream-proxy") || content.includes("proxyUrl"),
      "Must support gateway proxy fallback for private network CORS"
    );
    assert.ok(
      content.includes("Camera disconnected — footage unavailable"),
      "Must show exact disconnected message on stream failure"
    );
  });

  test("verifies CameraTile CameraPreview handles MJPEG with IntersectionObserver", () => {
    const tilePath = path.join(frontendSrc, "features/cameras/CameraTile.jsx");
    const content = fs.readFileSync(tilePath, "utf-8");
    assert.ok(content.includes("isMjpeg"), "Preview must identify MJPEG streams");
    assert.ok(content.includes("IntersectionObserver"), "Preview must use IntersectionObserver for resource pause");
  });

  test("verifies cameraApi client exposes verify, verifyStream, reconnect, and discover endpoints", () => {
    const apiPath = path.join(frontendSrc, "services/campusApi.js");
    const content = fs.readFileSync(apiPath, "utf-8");
    assert.ok(content.includes("verify:"), "cameraApi must expose verify endpoint");
    assert.ok(content.includes("verifyStream:"), "cameraApi must expose verifyStream endpoint");
    assert.ok(content.includes("reconnect:"), "cameraApi must expose reconnect endpoint");
    assert.ok(content.includes("discover:"), "cameraApi must expose discover endpoint");
    assert.ok(content.includes("getStreamProxyUrl:"), "cameraApi must expose getStreamProxyUrl");
  });

  test("verifies CameraTile provides quick reconnect and last-seen timestamps", () => {
    const tilePath = path.join(frontendSrc, "features/cameras/CameraTile.jsx");
    const content = fs.readFileSync(tilePath, "utf-8");
    assert.ok(content.includes("formatLastSeen"), "CameraTile must format last seen timestamps");
    assert.ok(content.includes("handleQuickReconnect"), "CameraTile must provide quick reconnect trigger");
    assert.ok(content.includes("cameraApi.reconnect"), "CameraTile must call reconnect API");
  });

  test("verifies CameraDetailModal provides subnet discovery and stream diagnostic controls", () => {
    const modalPath = path.join(frontendSrc, "features/cameras/CameraDetailModal.jsx");
    const content = fs.readFileSync(modalPath, "utf-8");
    assert.ok(content.includes("Auto-Discover Phone IP"), "Modal must have Auto-Discover Phone IP trigger");
    assert.ok(content.includes("cameraApi.discover"), "Modal must call discover API");
    assert.ok(content.includes("Auto-Reconnection Engine"), "Modal must display auto-reconnection telemetry");
  });
});
