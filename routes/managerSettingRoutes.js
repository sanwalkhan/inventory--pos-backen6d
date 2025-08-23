const express = require("express");
const managerSettingRouter = express.Router();

const {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require("../controllers/managerSettingController");

managerSettingRouter.get("/manager/settings/users", getUsers);
managerSettingRouter.get("/manager/settings/users/:id", getUserById);
managerSettingRouter.put("/manager/settings/users/:id", updateUser);
managerSettingRouter.delete("/manager/settings/users/:id", deleteUser);

module.exports = managerSettingRouter;
