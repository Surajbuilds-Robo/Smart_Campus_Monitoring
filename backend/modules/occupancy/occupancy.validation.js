const { body, param, query } = require("express-validator");

const listOccupancyValidation = [
  query("cameraId").optional().isString().trim().notEmpty(),
  query("level").optional().isIn(["normal", "warning", "critical"]),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
];

const idValidation = [
  param("id").isMongoId().withMessage("Invalid occupancy record ID."),
];

const createOccupancyValidation = [
  body("cameraId").isString().trim().notEmpty(),
  body("zoneName").isString().trim().notEmpty(),
  body("peopleCount").isInt({ min: 0 }),
  body("capacity").isInt({ min: 1 }),
  body("observedAt").optional().isISO8601(),
];

module.exports = {
  listOccupancyValidation,
  idValidation,
  createOccupancyValidation,
};