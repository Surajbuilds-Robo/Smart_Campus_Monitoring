const mongoose = require("mongoose");
const Occupancy = require("./occupancy.model");
const Camera = require("../cameras/camera.model");
const { roles, occupancy: occupancyConstants } = require("../../../shared/constants.json");

const WARNING_THRESHOLD = occupancyConstants?.warningThreshold ?? 0.7;
const CRITICAL_THRESHOLD = occupancyConstants?.criticalThreshold ?? 0.9;

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function departmentScope(user) {
  if (
    user.role === roles.SUPER_ADMIN ||
    user.role === roles.SECURITY ||
    user.role === roles.STUDENT
  ) {
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

  throw httpError(403, "You do not have permission to access occupancy records.");
}

function calculateLevel(ratio) {
  if (ratio >= CRITICAL_THRESHOLD) return "critical";
  if (ratio >= WARNING_THRESHOLD) return "warning";
  return "normal";
}

function safePublishOccupancy(record) {
  try {
    const { publishOccupancyUpdate } = require("../../src/realtime/eventPublisher");
    publishOccupancyUpdate(record);
  } catch {
    // Non-fatal if socket server not running in isolated test mode
  }
}

async function listOccupancy(user, filters = {}) {
  const query = { ...departmentScope(user) };

  if (user.role !== roles.STUDENT) {
    if (filters.cameraId) {
      query.cameraId = filters.cameraId;
    }
    if (filters.camera) {
      query.camera = filters.camera;
    }
  }
  if (filters.level) {
    query.level = filters.level;
  }

  const limit = Math.min(Number(filters.limit) || 50, 100);

  const records = await Occupancy.find(query)
    .sort({ observedAt: -1 })
    .limit(limit)
    .populate("camera", "name cameraId location")
    .lean();

  if (user.role === roles.STUDENT) {
    // Limit student-facing data strictly to approved public availability information
    return records.map((record) => ({
      id: String(record._id),
      zoneName: record.zoneName,
      level: record.level,
      occupancyRatio: record.occupancyRatio,
      peopleCount: record.peopleCount,
      capacity: record.capacity,
      observedAt: record.observedAt,
    }));
  }

  return records;
}

async function getOccupancyById(user, id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid occupancy record ID.");
  }

  const record = await Occupancy.findOne({
    _id: id,
    ...departmentScope(user),
  })
    .populate("camera", "name cameraId location")
    .lean();

  if (!record) throw httpError(404, "Occupancy record not found.");

  if (user.role === roles.STUDENT) {
    return {
      id: String(record._id),
      zoneName: record.zoneName,
      level: record.level,
      occupancyRatio: record.occupancyRatio,
      peopleCount: record.peopleCount,
      capacity: record.capacity,
      observedAt: record.observedAt,
    };
  }

  return record;
}

async function createOccupancy(user, data) {
  if (![roles.SUPER_ADMIN, roles.SECURITY, roles.DEPT_HEAD, roles.FACULTY].includes(user?.role)) {
    throw httpError(403, "You do not have permission to record occupancy.");
  }

  const cameraQuery = {
    cameraId: data.cameraId,
    isActive: true,
  };

  if (user.role !== roles.SUPER_ADMIN) {
    if (!user.departmentId) {
      throw httpError(403, "Department assignment is required.");
    }
    cameraQuery.departmentId = user.departmentId;
  }

  const camera = await Camera.findOne(cameraQuery);
  if (!camera) {
    throw httpError(404, `Accessible active camera "${data.cameraId}" not found.`);
  }

  const peopleCount = Number(data.peopleCount);
  const capacity = Number(data.capacity);

  if (!Number.isInteger(peopleCount) || peopleCount < 0) {
    throw httpError(400, "People count must be a non-negative integer.");
  }

  if (!Number.isInteger(capacity) || capacity < 1) {
    throw httpError(400, "Capacity must be an integer greater than 0.");
  }

  let observedAt = new Date();
  if (data.observedAt) {
    observedAt = new Date(data.observedAt);
    if (isNaN(observedAt.getTime())) {
      throw httpError(400, "Invalid observedAt timestamp.");
    }
    const futureThreshold = new Date(Date.now() + 60 * 1000);
    if (observedAt > futureThreshold) {
      throw httpError(400, "Occupancy timestamp cannot be in the future.");
    }
  }

  const occupancyRatio = Number((peopleCount / capacity).toFixed(2));
  const level = calculateLevel(occupancyRatio);

  const record = await Occupancy.create({
    camera: camera._id,
    cameraId: camera.cameraId,
    zoneName: String(data.zoneName).trim(),
    departmentId: camera.departmentId,
    peopleCount,
    capacity,
    occupancyRatio,
    level,
    observedAt,
  });

  safePublishOccupancy(record);

  return record;
}

module.exports = {
  listOccupancy,
  getOccupancyById,
  createOccupancy,
  calculateLevel,
};