const { validationResult } = require("express-validator");
const service = require("./notification.service");

function validate(req, res) {
  const errors = validationResult(req);

  if (errors.isEmpty()) return false;

  res.status(400).json({
    success: false,
    message: "Validation failed.",
    errors: errors.array(),
  });

  return true;
}

async function list(req, res, next) {
  try {
    if (validate(req, res)) return;

    const notifications = await service.listForUser(req.user.id, {
      unreadOnly: req.query.unreadOnly === "true",
      limit: req.query.limit,
    });

    return res.json({
      success: true,
      data: { notifications },
    });
  } catch (error) {
    next(error);
  }
}

async function markRead(req, res, next) {
  try {
    if (validate(req, res)) return;

    const notification = await service.markRead(
      req.user.id,
      req.params.id
    );

    return res.json({
      success: true,
      data: { notification },
    });
  } catch (error) {
    next(error);
  }
}

async function markAllRead(req, res, next) {
  try {
    const result = await service.markAllRead(req.user.id);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, markRead, markAllRead };