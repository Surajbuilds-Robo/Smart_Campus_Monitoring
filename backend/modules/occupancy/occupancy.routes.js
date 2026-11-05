const express = require("express");

const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");
const controller = require("./occupancy.controller");

const {
  listOccupancyValidation,
  idValidation,
  createOccupancyValidation,
} = require("./occupancy.validation");

const router = express.Router();

router.use(authenticate);

router.get(
  "/",
  authorize("SUPER_ADMIN", "DEPT_HEAD", "FACULTY", "STUDENT"),
  listOccupancyValidation,
  controller.list
);

router.get(
  "/:id",
  authorize("SUPER_ADMIN", "DEPT_HEAD", "FACULTY", "STUDENT"),
  idValidation,
  controller.getById
);

router.post(
  "/",
  authorize("SUPER_ADMIN", "DEPT_HEAD", "FACULTY"),
  createOccupancyValidation,
  controller.create
);

module.exports = router;