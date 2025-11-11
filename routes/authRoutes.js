const authRouter = require("express").Router();
const {
  authController,
  loginController,
  verifyOTPController,
  resendOTPController,
} = require("../controllers/authController");

authRouter.post("/login", loginController);
authRouter.post("/signup", authController);
authRouter.post("/verify-otp", verifyOTPController);
authRouter.post("/resend-otp", resendOTPController);

module.exports = authRouter;