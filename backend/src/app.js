const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const { env } = require("./config/env");
const { getDBStatus } = require("./config/database");
const notFound = require("../middleware/notFound");
const errorHandler = require("../middleware/errorHandler");

const app = express();

app.disable("x-powered-by");

const allowedOrigins = (env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
    return true;
  }

  // In development, also allow Expo web and local LAN origins
  if (env.NODE_ENV === "development") {
    try {
      const parsed = new URL(origin);
      if (
        parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        /^10\.\d+\.\d+\.\d+$/.test(parsed.hostname) ||
        /^192\.168\.\d+\.\d+$/.test(parsed.hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(parsed.hostname)
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: env.NODE_ENV === "production" ? undefined : false,
  })
);

// Allow Chrome / Edge Private Network Access preflight
app.use((req, res, next) => {
  if (req.headers["access-control-request-private-network"]) {
    res.setHeader("Access-Control-Allow-Private-Network", "true");
  }
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS."));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

if (env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else if (env.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}

// Health check endpoint - placed before public rate limiter for monitoring/orchestrator liveness
app.get("/api/v1/health", (req, res) => {
  const dbStatus = getDBStatus();

  return res.status(200).json({
    success: true,
    message: "Smart Campus Monitoring API is running.",
    database: dbStatus.status,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    keyGenerator: (req) => {
      const targetUrl = (req.originalUrl || req.baseUrl + req.path || req.path || "").toLowerCase();
      // Public authentication endpoints establish new credentials and must never key on stale token claims
      if (targetUrl.includes("/auth/login") || targetUrl.includes("/auth/register")) {
        return req.ip;
      }

      // Per-user rate limiting for authenticated users to isolate request quotas
      // and ensure one camera's activity never blocks other cameras or users
      if (req.user?.id) return `user:${req.user.id}`;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
          const raw = authHeader.slice(7).trim();
          const decoded = jwt.decode(raw);
          if (decoded && decoded.sub) {
            return `user:${decoded.sub}`;
          }
        } catch {}
      }
      return req.ip;
    },
    skip: (req) => {
      if (process.env.NODE_ENV === "test") return true;
      const targetUrl = (req.originalUrl || req.baseUrl + req.path || req.path || "").toLowerCase();
      // Health check endpoint is an internal heartbeat probe
      if (targetUrl.includes("/health")) return true;
      // Long-lived MJPEG streaming connections must not consume short-lived request rate limits
      if (targetUrl.includes("/stream-proxy") || targetUrl.includes("/annotated-stream")) return true;
      // Authenticated AI service ingest has dedicated token auth
      if (targetUrl.includes("/ai/events") || targetUrl.includes("/v1/ai") || targetUrl.includes("/api/v1/ai")) return true;
      return false;
    },
    handler: (req, res, next, options) => {
      const retryAfter = Math.ceil(options.windowMs / 1000);
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(options.statusCode || 429).json({
        success: false,
        rateLimited: true,
        retryAfter,
        message: "Too many requests. Please try again later.",
      });
    },
  })
);

// Feature routes
app.use("/api/v1/auth", require("../modules/auth/auth.routers"));
app.use("/api/v1/users", require("../modules/users/user.routes"));
app.use("/api/v1/cameras", require("../modules/cameras/camera.routes"));
app.use("/api/v1/parking", require("../modules/parking/parking.routes"));
app.use("/api/v1/occupancy", require("../modules/occupancy/occupancy.routes"));
app.use("/api/v1/incidents", require("../modules/incidents/incident.routes"));
app.use(
  "/api/v1/notifications",
  require("../modules/notifications/notification.routes")
);
app.use("/api/v1/ai", require("../modules/ai/ai.routes"));

// 404 handler
app.use(notFound);

// Central error handler
app.use(errorHandler);

module.exports = app;
