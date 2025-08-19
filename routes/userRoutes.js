const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  updateUser,
  addUser,
  deleteUser,
  getcurrentUser
} = require("../controllers/userController");

// Get all users
router.get("/users/all", getAllUsers);
router.get("/users/:id",getcurrentUser);

// Add a new user
router.post("/users", addUser);

// Update user data
router.put("/users/:id", updateUser);

// Delete user
router.delete("/users/:id", deleteUser);

module.exports = router;
