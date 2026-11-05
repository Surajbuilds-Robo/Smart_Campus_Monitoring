const { body, param, query } = require("express-validator");
const { roles } = require("../../../shared/constants.json");

const validRoles = Object.values(roles);

const createUserValidation = [
  body("name")
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters."),
  body("email")
    .trim()
    .isEmail()
    .withMessage("Enter a valid email address.")
    .normalizeEmail(),
  body("password")
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters."),
  body("role")
    .isIn(validRoles)
    .withMessage(`Role must be one of: ${validRoles.join(", ")}`),
  body("departmentId")
    .optional({ nullable: true })
    .isMongoId()
    .withMessage("Invalid department ID format."),
];

const updateUserValidation = [
  param("id").isMongoId().withMessage("Invalid user ID."),
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters."),
  body("email")
    .optional()
    .trim()
    .isEmail()
    .withMessage("Enter a valid email address.")
    .normalizeEmail(),
  body("password")
    .optional()
    .isString()
    .isLength({ min: 8, max: 128 })
    .withMessage("Password must be between 8 and 128 characters."),
  body("role")
    .optional()
    .isIn(validRoles)
    .withMessage(`Role must be one of: ${validRoles.join(", ")}`),
  body("departmentId")
    .optional({ nullable: true })
    .isMongoId()
    .withMessage("Invalid department ID format."),
  body("isActive")
    .optional()
    .isBoolean()
    .withMessage("isActive must be a boolean."),
];

const listUsersValidation = [
  query("role")
    .optional()
    .isIn(validRoles)
    .withMessage(`Role filter must be one of: ${validRoles.join(", ")}`),
];

module.exports = {
  createUserValidation,
  updateUserValidation,
  listUsersValidation,
};