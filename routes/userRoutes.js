const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  updateUser,
  addUser,
  deleteUser,
  getcurrentUser
} = require("../controllers/userController");
const { authenticateToken } = require("../middleware/authmiddleware");

// Get all users
router.get("/users/all",authenticateToken, getAllUsers);
router.get("/users/:id", authenticateToken ,getcurrentUser);

// Add a new user
router.post("/users", authenticateToken, addUser);

// Update user data
router.put("/users/:id",authenticateToken, updateUser);

// Delete user
router.delete("/users/:id",authenticateToken, deleteUser);

module.exports = router;
