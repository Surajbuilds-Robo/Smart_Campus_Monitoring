const { validationResult } = require("express-validator");
const service = require("./occupancy.service");

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

    const records = await service.listOccupancy(req.user, req.query);

    return res.json({
      success: true,
      data: { occupancy: records },
    });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    if (validate(req, res)) return;

    const record = await service.getOccupancyById(
      req.user,
      req.params.id
    );

    return res.json({
      success: true,
      data: { occupancy: record },
    });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    if (validate(req, res)) return;

    const record = await service.createOccupancy(req.user, req.body);

    return res.status(201).json({
      success: true,
      data: { occupancy: record },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { list, getById, create };