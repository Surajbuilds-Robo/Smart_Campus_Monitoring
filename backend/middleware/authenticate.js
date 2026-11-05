const jwt = require("jsonwebtoken");
const { roles } = require("../../shared/constants.json");

const VALID_ROLES = new Set(Object.values(roles));

function authenticate(req, res, next) {
  let token = null;
  let isFromQuery = false;
  const authorization = req.headers.authorization;

  if (authorization && authorization.startsWith("Bearer ")) {
    token = authorization.slice(7).trim();
  } else if (req.query && req.query.ticket) {
    token = String(req.query.ticket).trim();
    isFromQuery = true;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication token is required.",
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return res.status(500).json({
      success: false,
      message: "Authentication service is not configured.",
    });
  }

  try {
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
      return res.status(401).json({
        success: false,
        message: "Invalid authentication token.",
      });
    }

    if (isFromQuery) {
      if (decoded.ticketType !== "stream" && decoded.ticketType !== "evidence") {
        return res.status(403).json({
          success: false,
          message: "Query parameters can only be used with short-lived stream tickets, not primary authentication tokens.",
        });
      }

      const targetPath = (req.originalUrl || req.baseUrl + req.path || req.path || "").toLowerCase();
      if (decoded.ticketType === "stream" && !targetPath.includes("stream")) {
        return res.status(403).json({
          success: false,
          message: "Stream ticket can only access video stream endpoints.",
        });
      }

      if (decoded.ticketType === "evidence" && !targetPath.includes("evidence")) {
        return res.status(403).json({
          success: false,
          message: "Evidence ticket can only access incident evidence endpoints.",
        });
      }

      const cameraIdMatch = (req.originalUrl || req.baseUrl + req.path || req.path || "").match(/\/cameras\/([a-zA-Z0-9_-]+)/i);
      const routeCameraId = req.params?.id || (cameraIdMatch ? cameraIdMatch[1] : null);
      if (decoded.cameraId && routeCameraId && String(decoded.cameraId) !== String(routeCameraId)) {
        return res.status(403).json({
          success: false,
          message: "Stream ticket is not authorized for this camera.",
        });
      }
    }

    req.user = {
      id: String(decoded.sub),
      role: decoded.role,
      departmentId: decoded.departmentId ? String(decoded.departmentId) : null,
    };

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        error.name === "TokenExpiredError"
          ? "Authentication token has expired."
          : "Invalid authentication token.",
    });
  }
}

module.exports = authenticate;