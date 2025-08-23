const express = require("express");
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
} = require("../controllers/adminSettingController");

const adminSettingRouter = express.Router();

adminSettingRouter.get("/setting/users", getUsers);
adminSettingRouter.get("/setting/users/:id", getUserById);
adminSettingRouter.post("/setting/users", createUser);
adminSettingRouter.put("/setting/users/:id", updateUser);
adminSettingRouter.delete("/setting/users/:id", deleteUser);

module.exports = adminSettingRouter;
