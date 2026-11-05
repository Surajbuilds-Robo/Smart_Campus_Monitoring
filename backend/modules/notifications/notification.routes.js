const express = require("express");
const { param, query } = require("express-validator");

const authenticate = require("../../middleware/authenticate");
const controller = require("./notification.controller");

const router = express.Router();

router.use(authenticate);

router.get(
  "/",
  [
    query("unreadOnly").optional().isBoolean(),
    query("limit").optional().isInt({ min: 1, max: 100 }),
  ],
  controller.list
);

router.patch(
  "/read-all",
  controller.markAllRead
);

router.patch(
  "/:id/read",
  [param("id").isMongoId()],
  controller.markRead
);

module.exports = router;