const { validationResult } = require("express-validator");
const authService = require("./auth.service");

function handleValidation(req, res) {
  const errors = validationResult(req);

  if (errors.isEmpty()) {
    return false;
  }

  res.status(400).json({
    success: false,
    message: "Validation failed.",
    errors: errors.array().map((error) => ({
      field: error.path,
      message: error.msg,
    })),
  });

  return true;
}

async function login(req, res, next) {
  try {
    if (handleValidation(req, res)) return;

    const result = await authService.login(
      req.body.email,
      req.body.password
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function register(req, res, next) {
  try {
    if (handleValidation(req, res)) return;

    const result = await authService.registerStudent({
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
    });

    return res.status(201).json({
      success: true,
      message: "Student account created.",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getCurrentUser(req.user.id);

    return res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    return next(error);
  }
}

function logout(req, res) {
  // JWTs are stateless. The client must discard its token.
  // Server-side token revocation requires a denylist or token-version strategy.
  return res.status(200).json({
    success: true,
    message: "Logout acknowledged. Discard your access token.",
  });
}

module.exports = {
  login,
  register,
  me,
  logout,
};