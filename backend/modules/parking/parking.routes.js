const express = require("express");

const authenticate = require("../../middleware/authenticate");
const authorize = require("../../middleware/authorize");
const controller = require("./parking.controller");

const {
  createParkingValidation,
  updateParkingValidation,
  listParkingValidation,
} = require("./parking.validation");

const router = express.Router();

router.use(authenticate);

router.get("/", listParkingValidation, controller.list);
router.get("/:id", controller.getById);

router.post(
  "/",
  authorize("SUPER_ADMIN", "DEPT_HEAD"),
  createParkingValidation,
  controller.create
);

router.patch(
  "/:id",
  authorize("SUPER_ADMIN", "DEPT_HEAD"),
  updateParkingValidation,
  controller.update
);

module.exports = router;