const { body, param, query } = require("express-validator");
const { incident } = require("../../../shared/constants.json");

const INCIDENT_STATUSES = incident?.statuses || [
  "new",
  "acknowledged",
  "investigating",
  "resolved",
  "dismissed",
];
const INCIDENT_SEVERITIES = incident?.severities || ["info", "warning", "high", "critical"];
const INCIDENT_EVENT_TYPES = incident?.eventTypes || [
  "crowd_overcrowding",
  "parking_violation",
  "fall",
  "violence",
  "other",
];

const listValidation = [
  query("status")
    .optional()
    .isIn(INCIDENT_STATUSES)
    .withMessage(`Status must be one of: ${INCIDENT_STATUSES.join(", ")}`),

  query("severity")
    .optional()
    .isIn(INCIDENT_SEVERITIES)
    .withMessage(`Severity must be one of: ${INCIDENT_SEVERITIES.join(", ")}`),

  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
];

const idValidation = [
  param("id").isMongoId().withMessage("Invalid incident ID."),
];

const statusValidation = [
  ...idValidation,
  body("status")
    .isIn(INCIDENT_STATUSES)
    .withMessage(`Invalid status. Must be one of: ${INCIDENT_STATUSES.join(", ")}`),
];

const assignmentValidation = [
  ...idValidation,
  body("assignedTo")
    .isMongoId()
    .withMessage("A valid assigned user ID is required."),
];

const createIncidentValidation = [
  body("eventType")
    .isIn(INCIDENT_EVENT_TYPES)
    .withMessage(`Event type must be one of: ${INCIDENT_EVENT_TYPES.join(", ")}`),

  body("severity")
    .isIn(INCIDENT_SEVERITIES)
    .withMessage(`Severity must be one of: ${INCIDENT_SEVERITIES.join(", ")}`),

  body("cameraId")
    .trim()
    .notEmpty()
    .withMessage("Camera ID is required."),

  body("description")
    .trim()
    .isLength({ min: 5, max: 2000 })
    .withMessage("Description must be between 5 and 2000 characters."),

  body("metadata").optional().isObject(),
];

module.exports = {
  listValidation,
  idValidation,
  statusValidation,
  assignmentValidation,
  createIncidentValidation,
};