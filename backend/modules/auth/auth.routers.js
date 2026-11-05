const express = require("express");

const authController = require("./auth.controller");
const {
  loginValidation,
  registerValidation,
} = require("./auth.validation");

const authenticate = require("../../middleware/authenticate");

const router = express.Router();

router.post("/login", loginValidation, authController.login);

// Public registration can create STUDENT accounts only.
router.post("/register", registerValidation, authController.register);

router.get("/me", authenticate, authController.me);

router.post("/logout", authenticate, authController.logout);

module.exports = router;