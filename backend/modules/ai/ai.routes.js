const express = require("express");
const authenticateAIService = require("./ai.middleware");
const controller = require("./ai.controller");

const router = express.Router();

router.post("/events", authenticateAIService, controller.handleEvent);
router.get("/cameras", authenticateAIService, controller.listCamerasForAI);
router.get("/cameras/:cameraId", authenticateAIService, controller.getCameraConfig);

module.exports = router;

