const express = require("express");

const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");
const controller = require("./incident.controller");

const {
  listValidation,
  idValidation,
  statusValidation,
  assignmentValidation,
  createIncidentValidation,
} = require("./incident.validation");

const router = express.Router();

router.use(authenticate);

router.get(
  "/",
  authorize("SUPER_ADMIN", "DEPT_HEAD", "FACULTY"),
  listValidation,
  controller.list
);

router.get(
  "/:id",
  authorize("SUPER_ADMIN", "DEPT_HEAD", "FACULTY"),
  idValidation,
  controller.getById
);

router.post(
  "/",
  authorize("SUPER_ADMIN", "DEPT_HEAD", "FACULTY"),
  createIncidentValidation,
  controller.create
);

router.patch(
  "/:id/status",
  authorize("SUPER_ADMIN", "DEPT_HEAD", "FACULTY"),
  statusValidation,
  controller.updateStatus
);

router.patch(
  "/:id/assign",
  authorize("SUPER_ADMIN", "DEPT_HEAD"),
  assignmentValidation,
  controller.assign
);

router.get(
  "/:id/evidence/:storageKey",
  authorize("SUPER_ADMIN", "DEPT_HEAD", "FACULTY"),
  idValidation,
  controller.getEvidence
);

router.post(
  "/:id/retry-email",
  authorize("SUPER_ADMIN", "DEPT_HEAD"),
  idValidation,
  controller.retryEmail
);

module.exports = router;