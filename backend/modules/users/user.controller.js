const { validationResult } = require("express-validator");
const service = require("./user.service");

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

    const users = await service.listUsers(req.user, req.query);

    return res.json({ success: true, data: { users } });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    if (validate(req, res)) return;

    const user = await service.getUser(req.user, req.params.id);

    return res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    if (validate(req, res)) return;

    const user = await service.createUser(req.user, req.body);

    return res.status(201).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    if (validate(req, res)) return;

    const user = await service.updateUser(
      req.user,
      req.params.id,
      req.body
    );

    return res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, getById, create, update };