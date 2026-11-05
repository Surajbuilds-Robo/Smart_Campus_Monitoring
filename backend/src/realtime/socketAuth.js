const jwt = require("jsonwebtoken");
const { roles } = require("../../../shared/constants.json");

const VALID_ROLES = new Set(Object.values(roles));

function extractToken(socket) {
  if (socket.handshake.auth?.token && typeof socket.handshake.auth.token === "string") {
    return socket.handshake.auth.token.trim();
  }

  const authHeader = socket.handshake.headers?.authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }

  return null;
}

function socketAuth(socket, next) {
  try {
    const token = extractToken(socket);

    if (!token) {
      return next(new Error("Authentication token is required."));
    }

    const secret = process.env.JWT_SECRET;

    if (!secret || secret.length < 32) {
      console.error("JWT_SECRET is missing or insecure (<32 characters).");
      return next(new Error("Authentication service is not configured."));
    }

    const decoded = jwt.verify(token, secret, {
      algorithms: ["HS256"],
    });

    if (
      !decoded ||
      typeof decoded !== "object" ||
      !decoded.sub ||
      !decoded.role ||
      !VALID_ROLES.has(decoded.role)
    ) {
      return next(new Error("Invalid authentication token."));
    }

    socket.user = {
      id: String(decoded.sub),
      role: decoded.role,
      departmentId: decoded.departmentId ? String(decoded.departmentId) : null,
    };

    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return next(new Error("Authentication token has expired."));
    }
    return next(new Error("Invalid authentication token."));
  }
}

module.exports = socketAuth;