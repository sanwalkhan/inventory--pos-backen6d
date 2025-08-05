// In your usersManagementController.js (or wherever you handle users)

// Update user data
const bcrypt = require("bcrypt");
const User = require("../models/userModel");
const getAllUsers = async (req, res) => {
  try {
    console.log("👉 Fetching all users");
    const users = await User.find().select("-__v -password");
    console.log("✅ Users fetched:", users.length);
    res.status(200).json(users);
  } catch (error) {
    console.error("❌ Error fetching users:", error.message);
    res
      .status(500)
      .json({ message: "Server error while fetching users", error: error.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, password, role } = req.body;

    const updateData = { username, email, role };

    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -__v");

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found." });
    }

    res.status(200).json(updatedUser);
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getAllUsers,
  updateUser,
};
