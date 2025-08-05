const express = require("express");
const adminSettingRouter = express.Router();
const {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require("../controllers/adminSettingController");


adminSettingRouter.get("/setting/users", getUsers);
adminSettingRouter.get("/setting/users/:id", getUserById);
adminSettingRouter.put("/setting/users/:id", updateUser);
adminSettingRouter.delete("/setting/users/:id", deleteUser);

module.exports = adminSettingRouter;
