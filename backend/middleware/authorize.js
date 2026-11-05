const { roles } = require("../../shared/constants.json");

const VALID_ROLES = new Set(Object.values(roles));

function authorize(...allowedRoles) {
  if (allowedRoles.length === 0) {
    throw new Error("authorize requires at least one allowed role.");
  }

  for (const role of allowedRoles) {
    if (!VALID_ROLES.has(role)) {
      throw new Error(`Unknown authorization role: ${role}`);
    }
  }

  return function authorizeRequest(req, res, next) {
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required.",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource.",
      });
    }

    return next();
  };
}

module.exports = authorize;