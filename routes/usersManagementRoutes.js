const express = require("express");
const router = express.Router();
const usersManagementController = require("../controllers/usersManagementController");

router.get("/users/all", usersManagementController.getAllUsers);
router.put("/users/:id", usersManagementController.updateUser);

module.exports = router;
