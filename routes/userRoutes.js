const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  updateUser,
  addUser,
  deleteUser,
  getcurrentUser
} = require("../controllers/userController");
const { authenticate } = require("../middleware/authmiddleware");

// Get all users
router.get("/users/all", getAllUsers);
router.get("/users/:id", authenticate ,getcurrentUser);

// Add a new user
router.post("/users", addUser);

// Update user data
router.put("/users/:id", updateUser);

// Delete user
router.delete("/users/:id", deleteUser);

module.exports = router;
