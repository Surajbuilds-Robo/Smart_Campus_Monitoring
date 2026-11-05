const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../users/user.model");
const { roles } = require("../../../shared/constants.json");

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function createToken(user) {
  const secret = process.env.JWT_SECRET;

  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured securely with at least 32 characters.");
  }

  const userId = String(user._id || user.id);

  return jwt.sign(
    {
      role: user.role,
      departmentId: user.departmentId ? String(user.departmentId) : null,
    },
    secret,
    {
      subject: userId,
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
      algorithm: "HS256",
    }
  );
}

function publicUser(user) {
  return {
    id: String(user._id || user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    departmentId: user.departmentId ? String(user.departmentId) : null,
    isActive: user.isActive !== false,
  };
}

async function login(email, password) {
  if (!email || !password) {
    throw httpError(400, "Email and password are required.");
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail }).select("+passwordHash");

  if (!user) {
    throw httpError(401, "Invalid email or password.");
  }

  const passwordMatches = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw httpError(401, "Invalid email or password.");
  }

  if (!user.isActive) {
    throw httpError(403, "Account is disabled. Please contact an administrator.");
  }

  return {
    user: publicUser(user),
    token: createToken(user),
  };
}

async function registerStudent({ name, email, password }) {
  if (!name || !email || !password) {
    throw httpError(400, "Name, email, and password are required.");
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });

  if (existing) {
    throw httpError(409, "An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: roles.STUDENT,
    departmentId: null,
    isActive: true,
  });

  return {
    user: publicUser(user),
    token: createToken(user),
  };
}

async function getCurrentUser(userId) {
  if (!userId) {
    throw httpError(401, "User ID is required.");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw httpError(404, "User account not found.");
  }

  if (!user.isActive) {
    throw httpError(403, "User account is disabled.");
  }

  return publicUser(user);
}

module.exports = {
  createToken,
  publicUser,
  login,
  registerStudent,
  getCurrentUser,
};