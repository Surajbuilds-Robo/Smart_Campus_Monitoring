const { body, param, query } = require("express-validator");
const { camera } = require("../../../shared/constants.json");

const CAMERA_STATUSES = camera?.statuses || ["online", "offline", "maintenance"];

const createCameraValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Camera name must be 2–100 characters."),

  body("cameraId")
    .trim()
    .isLength({ min: 2, max: 100 })
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage("Camera ID contains invalid characters."),

  body("location")
    .trim()
    .notEmpty()
    .withMessage("Camera location is required."),

  body("building")
    .optional()
    .isString()
    .trim(),

  body("departmentId")
    .optional({ nullable: true })
    .isMongoId()
    .withMessage("Invalid department ID."),

  body("status")
    .optional()
    .isIn(CAMERA_STATUSES)
    .withMessage(`Status must be one of: ${CAMERA_STATUSES.join(", ")}`),

  body("streamUrl")
    .optional()
    .isString()
    .trim()
    .custom((val) => {
      if (!val) return true;
      const { validateStreamUrl } = require("./streamVerifier");
      const check = validateStreamUrl(val);
      if (!check.valid) {
        throw new Error(check.error);
      }
      return true;
    }),

  body("previewUrl")
    .optional()
    .isString()
    .trim()
    .custom((val) => {
      if (!val) return true;
      const { validateStreamUrl } = require("./streamVerifier");
      const check = validateStreamUrl(val);
      if (!check.valid) {
        throw new Error(check.error);
      }
      return true;
    }),

  body("streamType")
    .optional()
    .isIn(["auto", "mjpeg", "hls", "webrtc", "rtsp", "mp4"])
    .withMessage("Invalid stream type."),
];

const updateCameraValidation = [
  param("id").isMongoId().withMessage("Invalid camera ID."),

  body("name").optional().trim().isLength({ min: 2, max: 100 }),
  body("location").optional().trim().notEmpty(),
  body("building").optional().isString().trim(),
  body("departmentId")
    .optional({ nullable: true })
    .isMongoId()
    .withMessage("Invalid department ID."),
  body("status")
    .optional()
    .isIn(CAMERA_STATUSES)
    .withMessage(`Status must be one of: ${CAMERA_STATUSES.join(", ")}`),
  body("isActive").optional().isBoolean(),
  body("streamUrl").optional().isString().trim(),
  body("previewUrl").optional().isString().trim(),
  body("streamType")
    .optional()
    .isIn(["auto", "mjpeg", "hls", "webrtc", "rtsp", "mp4"])
    .withMessage("Invalid stream type."),
];

const listCameraValidation = [
  query("status")
    .optional()
    .isIn(CAMERA_STATUSES)
    .withMessage(`Status filter must be one of: ${CAMERA_STATUSES.join(", ")}`),
];

const mongoIdParamValidation = [
  param("id").isMongoId().withMessage("Invalid camera ID."),
];

module.exports = {
  createCameraValidation,
  updateCameraValidation,
  listCameraValidation,
  mongoIdParamValidation,
};