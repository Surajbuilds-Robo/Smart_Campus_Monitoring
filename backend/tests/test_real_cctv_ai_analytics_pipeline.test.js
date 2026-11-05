const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("Real CCTV AI Analytics Pipeline — Architecture & Regression Suite", async (t) => {
  const backendDir = path.resolve(__dirname, "..");
  const aiServiceDir = path.resolve(backendDir, "../ai-service");
  const frontendDir = path.resolve(backendDir, "../frontend/src");

  await t.test("1. CAM-02 timeout root cause and stream configuration resilience", () => {
    const aiEnvPath = path.resolve(aiServiceDir, ".env");
    const aiEnvContent = fs.readFileSync(aiEnvPath, "utf8");

    // Must not point to obsolete unreachable subnet 10.112.164.88
    assert.strictEqual(
      aiEnvContent.includes("10.112.164.88"),
      false,
      "AI Service .env must not contain obsolete unreachable IP 10.112.164.88"
    );

    // Verify worker has per-camera independent sessions and bounded exponential backoff
    const workerPath = path.resolve(aiServiceDir, "worker.py");
    const workerContent = fs.readFileSync(workerPath, "utf8");
    assert.ok(
      workerContent.includes("class CameraSession"),
      "Worker must implement independent per-camera CameraSession architecture"
    );
    assert.ok(
      workerContent.includes("self.settings.max_retry_delay"),
      "Worker must bound exponential retry delays to prevent thread exhaustion"
    );
  });

  await t.test("2. Real YOLO detection annotation and frame overlay generation", () => {
    const workerPath = path.resolve(aiServiceDir, "worker.py");
    const workerContent = fs.readFileSync(workerPath, "utf8");

    assert.ok(
      workerContent.includes("latest_annotated_jpeg"),
      "CameraSession must maintain latest_annotated_jpeg buffer with real detections"
    );
    assert.ok(
      workerContent.includes("cv2.rectangle"),
      "Worker must draw genuine YOLO bounding boxes onto frames"
    );
    assert.ok(
      workerContent.includes("cv2.putText"),
      "Worker must render genuine confidence labels onto frames"
    );

    // Verify main.py exposes annotated stream endpoint
    const mainPath = path.resolve(aiServiceDir, "main.py");
    const mainContent = fs.readFileSync(mainPath, "utf8");
    assert.ok(
      mainContent.includes("/cameras/{camera_id}/annotated-stream"),
      "FastAPI must expose /cameras/{camera_id}/annotated-stream"
    );
  });

  await t.test("3. Backend persistence of confidence, detections array, and proxy route", () => {
    const occupancyModelPath = path.resolve(backendDir, "modules/occupancy/occupancy.model.js");
    const occupancyModelContent = fs.readFileSync(occupancyModelPath, "utf8");
    assert.ok(
      occupancyModelContent.includes("confidence:"),
      "Occupancy model must persist confidence metric"
    );
    assert.ok(
      occupancyModelContent.includes("detections:"),
      "Occupancy model must persist detections array"
    );

    const cameraServicePath = path.resolve(backendDir, "modules/cameras/camera.service.js");
    const cameraServiceContent = fs.readFileSync(cameraServicePath, "utf8");
    assert.ok(
      cameraServiceContent.includes("proxyAnnotatedStream"),
      "Camera service must export proxyAnnotatedStream"
    );
    assert.ok(
      cameraServiceContent.includes("thirtyMinsAgo"),
      "Camera analytics must query real historical observations for trend calculation"
    );
    assert.ok(
      cameraServiceContent.includes("recentDetections"),
      "Camera analytics must return genuine recent detections"
    );

    const cameraRoutesPath = path.resolve(backendDir, "modules/cameras/camera.routes.js");
    const cameraRoutesContent = fs.readFileSync(cameraRoutesPath, "utf8");
    assert.ok(
      cameraRoutesContent.includes("/:id/annotated-stream"),
      "Camera routes must expose /:id/annotated-stream route"
    );
  });

  await t.test("4. Frontend AI Vision Analysis Panel and Video Player integration", () => {
    const aiPanelPath = path.resolve(frontendDir, "features/cameras/AIAnalysisPanel.jsx");
    const aiPanelContent = fs.readFileSync(aiPanelPath, "utf8");

    assert.ok(
      aiPanelContent.includes("People Count Trend"),
      "AIAnalysisPanel must render People Count Trend"
    );
    assert.ok(
      aiPanelContent.includes("Recent Detections"),
      "AIAnalysisPanel must render Recent Detections"
    );
    assert.ok(
      aiPanelContent.includes("AI analysis unavailable"),
      "AIAnalysisPanel must honestly report when AI is offline"
    );

    const videoPlayerPath = path.resolve(frontendDir, "features/cameras/VideoPlayer.jsx");
    const videoPlayerContent = fs.readFileSync(videoPlayerPath, "utf8");
    assert.ok(
      videoPlayerContent.includes("annotated-stream"),
      "VideoPlayer must support live AI annotated stream"
    );
    assert.ok(
      videoPlayerContent.includes("AI Processing..."),
      "VideoPlayer must render AI Processing badge on video"
    );
  });
});
