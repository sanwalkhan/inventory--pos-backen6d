const express = require("express");
const {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
} = require("../controllers/adminSettingController");

const adminSettingRouter = express.Router();

adminSettingRouter.get("/setting/users", getUsers);
adminSettingRouter.get("/setting/users/:id", getUserById);
adminSettingRouter.put("/setting/users/:id", updateUser);
adminSettingRouter.delete("/setting/users/:id", deleteUser);



module.exports = adminSettingRouter;
