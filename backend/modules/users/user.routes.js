const express = require("express");

const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");
const controller = require("./user.controller");

const {
  createUserValidation,
  updateUserValidation,
  listUsersValidation,
} = require("./user.validation");

const router = express.Router();

router.use(authenticate);

router.get(
  "/",
  authorize("SUPER_ADMIN", "DEPT_HEAD"),
  listUsersValidation,
  controller.list
);

router.get(
  "/:id",
  authorize("SUPER_ADMIN", "DEPT_HEAD"),
  controller.getById
);

router.post(
  "/",
  authorize("SUPER_ADMIN", "DEPT_HEAD"),
  createUserValidation,
  controller.create
);

router.patch(
  "/:id",
  authorize("SUPER_ADMIN", "DEPT_HEAD"),
  updateUserValidation,
  controller.update
);

module.exports = router;