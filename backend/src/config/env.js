const path = require("path");
const dotenv = require("dotenv");

// Ensure .env is loaded from backend directory
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const env = {
  PORT: parseNumber(process.env.PORT, 5000),
  HOST: process.env.HOST || "0.0.0.0",
  NODE_ENV: process.env.NODE_ENV || "development",
  MONGODB_URI: process.env.MONGODB_URI || "",
  JWT_SECRET: process.env.JWT_SECRET || "",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "1h",
  CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:5173",
  AI_SERVICE_TOKEN: process.env.AI_SERVICE_TOKEN || "",
};

function validateEnv() {
  const errors = [];

  if (!env.MONGODB_URI) {
    errors.push("MONGODB_URI is required.");
  } else if (
    !env.MONGODB_URI.startsWith("mongodb://") &&
    !env.MONGODB_URI.startsWith("mongodb+srv://")
  ) {
    errors.push("MONGODB_URI must be a valid MongoDB connection string.");
  }

  if (!env.JWT_SECRET) {
    errors.push("JWT_SECRET is required.");
  }

  if (env.PORT < 1 || env.PORT > 65535) {
    errors.push("PORT must be a valid port number between 1 and 65535.");
  }

  if (errors.length > 0) {
    throw new Error(
      `Environment configuration error:\n - ${errors.join("\n - ")}`
    );
  }

  return env;
}

module.exports = { env, validateEnv };
