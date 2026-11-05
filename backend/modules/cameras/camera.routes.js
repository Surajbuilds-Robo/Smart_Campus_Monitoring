const express = require("express");
const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");

const controller = require("./camera.controller");
const {
  createCameraValidation,
  updateCameraValidation,
  listCameraValidation,
} = require("./camera.validation");

const router = express.Router();

router.use(authenticate);

// Viewing routes - Authorized for security staff and departmental leadership
router.get(
  "/",
  authorize("SUPER_ADMIN", "SECURITY", "DEPT_HEAD", "FACULTY"),
  listCameraValidation,
  controller.list
);

router.get(
  "/:id",
  authorize("SUPER_ADMIN", "SECURITY", "DEPT_HEAD", "FACULTY"),
  controller.getById
);

router.get(
  "/:id/stream",
  authorize("SUPER_ADMIN", "SECURITY", "DEPT_HEAD", "FACULTY"),
  controller.getStream
);

router.get(
  "/:id/stream-ticket",
  authorize("SUPER_ADMIN", "SECURITY", "DEPT_HEAD", "FACULTY"),
  controller.getStreamTicket
);

router.get(
  "/:id/analytics",
  authorize("SUPER_ADMIN", "SECURITY", "DEPT_HEAD", "FACULTY"),
  controller.getAnalytics
);

router.get(
  "/:id/stream-proxy",
  authorize("SUPER_ADMIN", "SECURITY", "DEPT_HEAD", "FACULTY"),
  controller.streamProxy
);

router.get(
  "/:id/annotated-stream",
  authorize("SUPER_ADMIN", "SECURITY", "DEPT_HEAD", "FACULTY"),
  controller.annotatedStreamProxy
);

router.get(
  "/:id/announce",
  authorize("SUPER_ADMIN", "SECURITY", "DEPT_HEAD", "FACULTY"),
  controller.announce
);

// Management routes - STRICTLY RESTRICTED to SUPER_ADMIN and SECURITY roles only
router.post(
  "/:id/verify",
  authorize("SUPER_ADMIN", "SECURITY"),
  controller.verify
);

router.post(
  "/:id/reconnect",
  authorize("SUPER_ADMIN", "SECURITY"),
  controller.reconnect
);

router.post(
  "/:id/discover",
  authorize("SUPER_ADMIN", "SECURITY"),
  controller.discover
);

router.post(
  "/:id/announce",
  authorize("SUPER_ADMIN", "SECURITY"),
  controller.announce
);

router.post(
  "/verify-stream",
  authorize("SUPER_ADMIN", "SECURITY"),
  controller.verifyRaw
);

router.post(
  "/",
  authorize("SUPER_ADMIN", "SECURITY"),
  createCameraValidation,
  controller.create
);

router.patch(
  "/:id",
  authorize("SUPER_ADMIN", "SECURITY"),
  updateCameraValidation,
  controller.update
);

router.delete(
  "/:id",
  authorize("SUPER_ADMIN", "SECURITY"),
  controller.remove
);

module.exports = router;