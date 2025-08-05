const express = require("express");
const adminRouter = express.Router();
const path = require("path");
const adminController = require("../controllers/adminController");


adminRouter.get("/users", adminController.getUsers);
adminRouter.put("/user/:id", adminController.updatedUser);
adminRouter.delete("/user/:id", adminController.deleteUser);


module.exports = adminRouter;
