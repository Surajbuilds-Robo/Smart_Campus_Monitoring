function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  let statusCode =
    Number.isInteger(err.statusCode) &&
    err.statusCode >= 400 &&
    err.statusCode <= 599
      ? err.statusCode
      : 500;

  // Handle express.json() / body-parser syntax errors
  if (err.type === "entity.parse.failed" || (err instanceof SyntaxError && err.status === 400)) {
    statusCode = 400;
  }

  // Handle CORS rejection
  if (err.message === "Origin not allowed by CORS.") {
    statusCode = 403;
  }

  if (statusCode >= 500) {
    console.error("API server error:", err);
  }

  const message =
    statusCode >= 500
      ? "An internal server error occurred."
      : err.message || "Request failed.";

  return res.status(statusCode).json({
    success: false,
    message,
    ...(err.details ? { details: err.details } : {}),
    ...(process.env.NODE_ENV === "development" && statusCode >= 500
      ? { debug: err.message, stack: err.stack }
      : {}),
  });
}

module.exports = errorHandler;