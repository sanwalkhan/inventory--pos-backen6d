const bcrypt = require("bcrypt");
const User = require("../models/userModel");

// Fetch all users, exclude password and __v fields
const getAllUsers = async (req, res) => {
  try {
    console.log("👉 Fetching all users");
      const users = await User.find({ role: "cashier" }).select("-password -__v");
    console.log("✅ Users fetched:", users.length);
    res.status(200).json({ users });
  } catch (error) {
    console.error("❌ Error fetching users:", error.message);
    res.status(500).json({ message: "Server error while fetching users", error: error.message });
  }
};

// Update user info with optional password hashing
const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { username, email, password, role } = req.body;

    // Prepare update data with only provided fields
    const updateData = { username, email, role };

    // Remove undefined fields from updateData
    Object.keys(updateData).forEach(
      (key) => updateData[key] === undefined && delete updateData[key]
    );

    // If password provided, hash it
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
    console.error("Update user error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Add new user with password hashing
const addUser = async (req, res) => {
  try {
    const { username, email, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "Username, email and password are required." });
    }

    // Check email uniqueness
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User with this email already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: role || "cashier",
    });

    await newUser.save();

    // Exclude password from response
    const { password: _, __v, ...userData } = newUser.toObject();

    res.status(201).json({ message: "User added successfully", user: userData });
  } catch (error) {
    console.error("Add user error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Delete user by id
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const deleted = await User.findByIdAndDelete(userId);
    if (!deleted) {
      return res.status(404).json({ message: "User not found." });
    }
    res.status(200).json({ message: "User deleted successfully." });
  } catch (error) {
    console.error("Delete user error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getAllUsers,
  updateUser,
  addUser,
  deleteUser,
};
