const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./user.model");
const { recordAudit } = require("../audit/audit.service");
const { roles } = require("../../../shared/constants.json");

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function publicUser(user) {
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId ? String(user.departmentId) : null,
    isActive: user.isActive !== false,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function scopeFor(user) {
  if (user.role === roles.SUPER_ADMIN) {
    return {};
  }

  if (user.role === roles.DEPT_HEAD && user.departmentId) {
    return { departmentId: user.departmentId };
  }

  throw httpError(403, "You do not have permission to manage users.");
}

async function listUsers(actor, filters = {}) {
  const query = { ...scopeFor(actor) };

  if (filters.role) {
    query.role = filters.role;
  }

  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return users.map(publicUser);
}

async function getUser(actor, id) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid user ID.");
  }

  const user = await User.findOne({
    _id: id,
    ...scopeFor(actor),
  }).lean();

  if (!user) {
    throw httpError(404, "User not found.");
  }

  return publicUser(user);
}

async function createUser(actor, data) {
  scopeFor(actor);

  if (actor.role === roles.DEPT_HEAD) {
    if (data.role === roles.SUPER_ADMIN || data.role === roles.DEPT_HEAD) {
      throw httpError(
        403,
        "Department heads cannot create administrator or department head accounts."
      );
    }

    if (
      data.departmentId &&
      String(data.departmentId) !== String(actor.departmentId)
    ) {
      throw httpError(
        403,
        "Department heads cannot create users for another department."
      );
    }
  }

  const normalizedEmail = String(data.email).toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });

  if (existing) {
    throw httpError(409, "Email is already registered.");
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  const user = await User.create({
    name: String(data.name).trim(),
    email: normalizedEmail,
    passwordHash,
    role: data.role,
    departmentId:
      actor.role === roles.SUPER_ADMIN
        ? data.departmentId || null
        : actor.departmentId,
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
  });

  await recordAudit({
    actor,
    action: "USER_CREATED",
    targetModel: "User",
    targetId: user._id,
    departmentId: user.departmentId,
    details: { name: user.name, email: user.email, role: user.role },
  });

  return publicUser(user);
}

async function updateUser(actor, id, data) {
  if (!mongoose.isValidObjectId(id)) {
    throw httpError(400, "Invalid user ID.");
  }

  const user = await User.findOne({
    _id: id,
    ...scopeFor(actor),
  });

  if (!user) {
    throw httpError(404, "User not found.");
  }

  if (user.role === roles.SUPER_ADMIN && actor.role !== roles.SUPER_ADMIN) {
    throw httpError(403, "Super administrator accounts cannot be edited here.");
  }

  if (actor.role === roles.DEPT_HEAD) {
    if (user.role === roles.DEPT_HEAD && String(actor.id) !== String(user._id)) {
      throw httpError(
        403,
        "Department heads cannot modify other department head accounts."
      );
    }

    if (
      data.role &&
      (data.role === roles.SUPER_ADMIN || data.role === roles.DEPT_HEAD)
    ) {
      throw httpError(
        403,
        "Department heads cannot assign administrator or department head roles."
      );
    }

    if (
      data.departmentId &&
      String(data.departmentId) !== String(actor.departmentId)
    ) {
      throw httpError(
        403,
        "Department heads cannot assign users to another department."
      );
    }
  }

  if (data.email) {
    const normalizedEmail = String(data.email).toLowerCase().trim();
    if (normalizedEmail !== user.email) {
      const duplicate = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: user._id },
      });

      if (duplicate) {
        throw httpError(409, "Email is already registered.");
      }

      user.email = normalizedEmail;
    }
  }

  if (data.password) {
    user.passwordHash = await bcrypt.hash(data.password, 12);
  }

  if (data.name !== undefined) user.name = String(data.name).trim();
  if (data.role !== undefined) user.role = data.role;
  if (data.isActive !== undefined) user.isActive = Boolean(data.isActive);

  if (actor.role === roles.SUPER_ADMIN && data.departmentId !== undefined) {
    user.departmentId = data.departmentId || null;
  }

  await user.save();

  await recordAudit({
    actor,
    action: "USER_UPDATED",
    targetModel: "User",
    targetId: user._id,
    departmentId: user.departmentId,
    details: {
      role: data.role,
      isActive: data.isActive,
      departmentId: data.departmentId,
    },
  });

  return publicUser(user);
}

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  publicUser,
};