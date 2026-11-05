const mongoose = require("mongoose");
const Parking = require("./parking.model");
const { recordAudit } = require("../audit/audit.service");
const { roles, parking: parkingConstants } = require("../../../shared/constants.json");

const VALID_STATUSES = parkingConstants?.statuses || ["available", "full", "unavailable"];

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function departmentScope(user) {
  if (user.role === roles.SUPER_ADMIN || user.role === roles.STUDENT) {
    return {};
  }

  if (user.role === roles.DEPT_HEAD || user.role === roles.FACULTY) {
    if (!user.departmentId) {
      throw httpError(403, "Department assignment is required.");
    }

    return {
      $or: [{ departmentId: user.departmentId }, { departmentId: null }],
    };
  }

  throw httpError(403, "You do not have permission to access parking records.");
}

function canManage(user) {
  return [roles.SUPER_ADMIN, roles.DEPT_HEAD].includes(user.role);
}

async function listParking(user, filters = {}) {
  const query = {
    ...departmentScope(user),
    isActive: true,
  };

  if (filters.status) {
    query.status = filters.status;
  }

  const zones = await Parking.find(query).sort({ name: 1 }).lean();

  if (user.role === roles.STUDENT) {
    return zones.map((zone) => ({
      id: String(zone._id),
      name: zone.name,
      zoneId: zone.zoneId,
      location: zone.location,
      building: zone.building,
      totalSpaces: zone.totalSpaces,
      occupiedSpaces: zone.occupiedSpaces,
      availableSpaces: zone.availableSpaces,
      status: zone.status,
      lastUpdatedAt: zone.lastUpdatedAt,
    }));
  }

  return zones;
}

async function getParkingById(user, id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid parking zone ID.");
  }

  const parking = await Parking.findOne({
    _id: id,
    ...departmentScope(user),
  }).lean();

  if (!parking) throw httpError(404, "Parking zone not found.");

  if (user.role === roles.STUDENT) {
    return {
      id: String(parking._id),
      name: parking.name,
      zoneId: parking.zoneId,
      location: parking.location,
      building: parking.building,
      totalSpaces: parking.totalSpaces,
      occupiedSpaces: parking.occupiedSpaces,
      availableSpaces: parking.availableSpaces,
      status: parking.status,
      lastUpdatedAt: parking.lastUpdatedAt,
    };
  }

  return parking;
}

async function createParking(user, data) {
  if (!canManage(user)) {
    throw httpError(403, "You do not have permission to create parking zones.");
  }

  const normalizedZoneId = String(data.zoneId).trim();
  const existing = await Parking.findOne({ zoneId: normalizedZoneId });
  if (existing) {
    throw httpError(409, `Parking zone ID "${normalizedZoneId}" is already registered.`);
  }

  const totalSpaces = Number(data.totalSpaces);
  const occupiedSpaces = data.occupiedSpaces !== undefined ? Number(data.occupiedSpaces) : 0;

  if (occupiedSpaces > totalSpaces) {
    throw httpError(400, "Occupied spaces cannot exceed total spaces.");
  }

  const departmentId =
    user.role === roles.SUPER_ADMIN
      ? data.departmentId || null
      : user.departmentId;

  if (
    user.role === roles.DEPT_HEAD &&
    data.departmentId &&
    String(data.departmentId) !== String(user.departmentId)
  ) {
    throw httpError(403, "You cannot create a zone for another department.");
  }

  const availableSpaces = totalSpaces - occupiedSpaces;
  const status = availableSpaces === 0 ? "full" : "available";

  const parking = await Parking.create({
    name: data.name.trim(),
    zoneId: normalizedZoneId,
    location: data.location.trim(),
    building: data.building ? data.building.trim() : "",
    departmentId,
    totalSpaces,
    occupiedSpaces,
    availableSpaces,
    status,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    lastUpdatedAt: new Date(),
  });

  await recordAudit({
    actor: user,
    action: "PARKING_CREATED",
    targetModel: "Parking",
    targetId: parking._id,
    departmentId: parking.departmentId,
    details: { zoneId: parking.zoneId, totalSpaces, occupiedSpaces },
  });

  return parking;
}

async function updateParking(user, id, data) {
  if (!canManage(user)) {
    throw httpError(403, "You do not have permission to update parking zones.");
  }

  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid parking zone ID.");
  }

  const parking = await Parking.findOne({
    _id: id,
    ...departmentScope(user),
  });

  if (!parking) throw httpError(404, "Parking zone not found.");

  const newTotal =
    data.totalSpaces !== undefined ? Number(data.totalSpaces) : parking.totalSpaces;
  const newOccupied =
    data.occupiedSpaces !== undefined ? Number(data.occupiedSpaces) : parking.occupiedSpaces;

  if (newOccupied > newTotal) {
    throw httpError(400, "Total spaces cannot be less than occupied spaces.");
  }

  for (const field of ["name", "location", "building", "isActive"]) {
    if (data[field] !== undefined) parking[field] = data[field];
  }

  parking.totalSpaces = newTotal;
  parking.occupiedSpaces = newOccupied;
  parking.availableSpaces = Math.max(0, newTotal - newOccupied);

  if (data.status && VALID_STATUSES.includes(data.status)) {
    parking.status = data.status;
  } else if (parking.status !== "unavailable") {
    parking.status = parking.availableSpaces === 0 ? "full" : "available";
  }

  parking.lastUpdatedAt = new Date();
  await parking.save();

  await recordAudit({
    actor: user,
    action: "PARKING_UPDATED",
    targetModel: "Parking",
    targetId: parking._id,
    departmentId: parking.departmentId,
    details: {
      totalSpaces: parking.totalSpaces,
      occupiedSpaces: parking.occupiedSpaces,
      status: parking.status,
    },
  });

  try {
    const { publishParkingUpdate } = require("../../src/realtime/eventPublisher");
    publishParkingUpdate(parking);
  } catch {
    // Non-fatal if publisher offline
  }

  return parking;
}

async function updateOccupancyFromAI(zoneId, occupiedSpaces) {
  if (!Number.isInteger(occupiedSpaces) || occupiedSpaces < 0) {
    throw httpError(400, "Invalid occupied-space count.");
  }

  const parking = await Parking.findOne({
    zoneId,
    isActive: true,
  });

  if (!parking) throw httpError(404, `Parking zone "${zoneId}" not found.`);

  if (occupiedSpaces > parking.totalSpaces) {
    throw httpError(400, "Occupied spaces cannot exceed total spaces.");
  }

  parking.occupiedSpaces = occupiedSpaces;
  parking.availableSpaces = Math.max(0, parking.totalSpaces - occupiedSpaces);
  if (parking.status !== "unavailable") {
    parking.status = parking.availableSpaces === 0 ? "full" : "available";
  }
  parking.lastUpdatedAt = new Date();

  await parking.save();

  try {
    const { publishParkingUpdate } = require("../../src/realtime/eventPublisher");
    publishParkingUpdate(parking);
  } catch {
    // Non-fatal if publisher offline
  }

  return parking;
}

module.exports = {
  listParking,
  getParkingById,
  createParking,
  updateParking,
  updateOccupancyFromAI,
};