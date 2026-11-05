const Camera = require("../cameras/camera.model");
const Occupancy = require("../occupancy/occupancy.model");
const { calculateLevel } = require("../occupancy/occupancy.service");
const { createIncidentFromAI } = require("../incidents/incident.service");

async function handleEvent(req, res, next) {
  try {
    const payload = req.body;

    if (!payload || typeof payload !== "object") {
      return res.status(400).json({
        success: false,
        message: "Invalid event payload.",
      });
    }

    const cameraId = payload.camera_id || payload.cameraId;
    const eventType = payload.event_type || payload.eventType;

    if (!cameraId || !eventType) {
      return res.status(400).json({
        success: false,
        message: "Camera ID and event type are required.",
      });
    }

    if (
      eventType === "crowd_measurement" ||
      eventType === "telemetry" ||
      eventType === "occupancy_update"
    ) {
      const camera = await Camera.findOne({ cameraId, isActive: true });
      if (!camera) {
        return res.status(404).json({
          success: false,
          message: `Active camera "${cameraId}" not found.`,
        });
      }

      const previousStatus = camera.status;
      camera.lastDetectionAt = new Date();
      camera.aiDetectionActive = true;
      camera.status = "online";
      camera.lastHeartbeat = new Date();
      camera.lastSeenAt = new Date();
      camera.consecutiveFailures = 0;
      await camera.save();

      if (previousStatus !== "online") {
        try {
          const { publishCameraStatus } = require("../../src/realtime/eventPublisher");
          publishCameraStatus(camera);
        } catch {}
      }

      const metadata = payload.metadata || {};
      const peopleCount = Number(metadata.people_count ?? metadata.peopleCount ?? 0);
      const threshold = Number(metadata.threshold ?? camera.crowdAlertThreshold ?? 4);

      // Reset crowd alert condition when fresh telemetry confirms count is at or below threshold
      if (peopleCount <= threshold && camera.crowdAlertActive) {
        camera.crowdAlertActive = false;
        await camera.save();
      }

      const capacity = Number(metadata.capacity || camera.capacity || 100);
      const ratio = capacity > 0 ? Number((peopleCount / capacity).toFixed(2)) : 0;
      const rawConf = payload.confidence ?? metadata.confidence;
      const confidence = rawConf != null ? Number(rawConf) : null;
      const detections = Array.isArray(metadata.detections) ? metadata.detections : [];

      let occRecord = null;
      try {
        occRecord = await Occupancy.create({
          camera: camera._id,
          cameraId: camera.cameraId,
          zoneName: camera.location || "Campus Zone",
          departmentId: camera.departmentId,
          peopleCount,
          capacity,
          occupancyRatio: ratio,
          level: calculateLevel(ratio),
          confidence,
          detections,
          observedAt: new Date(),
        });

        const { publishOccupancyUpdate } = require("../../src/realtime/eventPublisher");
        publishOccupancyUpdate(occRecord);
      } catch {
        // Non-fatal if socket not ready
      }

      return res.status(200).json({
        success: true,
        accepted: true,
        telemetry: true,
        data: {
          cameraId: camera.cameraId,
          peopleCount,
          capacity,
          occupancyRatio: ratio,
          observedAt: new Date(),
        },
      });
    }

    const result = await createIncidentFromAI(payload);

    const statusCode = result.deduplicated ? 200 : 201;

    return res.status(statusCode).json({
      success: true,
      accepted: true,
      deduplicated: Boolean(result.deduplicated),
      data: { incident: result.incident },
    });
  } catch (error) {
    next(error);
  }
}

async function getCameraConfig(req, res, next) {
  try {
    const { cameraId } = req.params;
    const camera = await Camera.findOne({ cameraId, isActive: true }).lean();

    if (!camera) {
      return res.status(404).json({
        success: false,
        message: `Active camera "${cameraId}" not found.`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        cameraId: camera.cameraId,
        name: camera.name,
        streamUrl: camera.streamUrl,
        previewUrl: camera.previewUrl,
        location: camera.location,
        status: camera.status,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function listCamerasForAI(req, res, next) {
  try {
    const cameras = await Camera.find({ isActive: true }).lean();
    return res.status(200).json({
      success: true,
      data: {
        cameras: cameras.map((c) => ({
          id: String(c._id),
          cameraId: c.cameraId,
          name: c.name,
          streamUrl: c.streamUrl,
          previewUrl: c.previewUrl,
          location: c.location,
          status: c.status,
          streamType: c.streamType,
          isActive: c.isActive,
          departmentId: c.departmentId ? String(c.departmentId) : null,
        })),
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { handleEvent, getCameraConfig, listCamerasForAI };

