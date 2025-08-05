const authRouter = require("express").Router();
const {
  authController,
  loginController,
} = require("../controllers/authController");

authRouter.post("/login", loginController);
authRouter.post("/signup", authController);

module.exports = authRouter;
