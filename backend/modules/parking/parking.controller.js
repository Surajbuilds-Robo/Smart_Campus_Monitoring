const { validationResult } = require("express-validator");
const service = require("./parking.service");

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

    const parking = await service.listParking(req.user, req.query);

    return res.json({
      success: true,
      data: { parking },
    });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    if (validate(req, res)) return;

    const parking = await service.getParkingById(
      req.user,
      req.params.id
    );

    return res.json({
      success: true,
      data: { parking },
    });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    if (validate(req, res)) return;

    const parking = await service.createParking(req.user, req.body);

    return res.status(201).json({
      success: true,
      data: { parking },
    });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    if (validate(req, res)) return;

    const parking = await service.updateParking(
      req.user,
      req.params.id,
      req.body
    );

    return res.json({
      success: true,
      data: { parking },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, getById, create, update };