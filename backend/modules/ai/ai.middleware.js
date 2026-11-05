function authenticateAIService(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "AI service authentication token is required.",
    });
  }

  const token = authorization.slice(7).trim();
  const configuredToken = process.env.AI_SERVICE_TOKEN;

  if (!configuredToken) {
    return res.status(500).json({
      success: false,
      message: "AI service authentication is not configured on the server.",
    });
  }

  if (token !== configuredToken) {
    return res.status(401).json({
      success: false,
      message: "Invalid AI service token.",
    });
  }

  return next();
}

module.exports = authenticateAIService;
