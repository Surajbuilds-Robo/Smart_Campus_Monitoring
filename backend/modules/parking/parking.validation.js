const { body, param, query } = require("express-validator");
const { parking } = require("../../../shared/constants.json");

const PARKING_STATUSES = parking?.statuses || ["available", "full", "unavailable"];

const createParkingValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Parking name must be 2–100 characters."),

  body("zoneId")
    .trim()
    .matches(/^[a-zA-Z0-9_-]+$/)
    .isLength({ min: 2, max: 100 })
    .withMessage("Zone ID contains invalid characters."),

  body("location").trim().notEmpty().withMessage("Parking location is required."),

  body("building").optional().isString().trim(),

  body("departmentId")
    .optional({ nullable: true })
    .isMongoId()
    .withMessage("Invalid department ID."),

  body("totalSpaces")
    .isInt({ min: 1 })
    .withMessage("Total spaces must be at least 1.")
    .toInt(),

  body("occupiedSpaces")
    .optional()
    .isInt({ min: 0 })
    .withMessage("Occupied spaces cannot be negative.")
    .toInt(),
];

const updateParkingValidation = [
  param("id").isMongoId().withMessage("Invalid parking zone ID."),

  body("name").optional().trim().isLength({ min: 2, max: 100 }),
  body("location").optional().trim().notEmpty(),
  body("building").optional().isString().trim(),
  body("totalSpaces").optional().isInt({ min: 1 }).toInt(),
  body("occupiedSpaces").optional().isInt({ min: 0 }).toInt(),
  body("status")
    .optional()
    .isIn(PARKING_STATUSES)
    .withMessage(`Status must be one of: ${PARKING_STATUSES.join(", ")}`),
  body("isActive").optional().isBoolean(),
];

const listParkingValidation = [
  query("status")
    .optional()
    .isIn(PARKING_STATUSES)
    .withMessage(`Status filter must be one of: ${PARKING_STATUSES.join(", ")}`),
];

module.exports = {
  createParkingValidation,
  updateParkingValidation,
  listParkingValidation,
};