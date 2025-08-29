const express = require("express");
const router = express.Router();
const resetPasswordController = require("../controllers/ResetPasswordController");

// Route to send reset password email
router.post("/forgot-password", resetPasswordController.forgotPassword);

// Route to validate reset token
router.get("/reset-password/validate/:token", resetPasswordController.validateResetToken);

// Route to reset password
router.post("/reset-password", resetPasswordController.resetPassword);

module.exports = router;
