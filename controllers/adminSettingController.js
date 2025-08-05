const User = require("../models/userModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { jwtConfig } = require("../config");

// Helper to verify JWT and return decoded user or respond error
function verifyTokenFromHeader(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authorization token missing" });
    return null;
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, jwtConfig.secret);
    return decoded; // { userId, username, role }
  } catch (error) {
    res.status(403).json({ message: "Invalid or expired token" });
    return null;
  }
}

const getUsers = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  if (decoded.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admins only" });
  }

  try {
    const users = await User.find({}, "-password").lean();
    res.json({ users });
  } catch (error) {
    console.error("Fetch users error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const getUserById = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const userId = req.params.id;
  if (decoded.role !== "admin" && decoded.userId !== userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const user = await User.findById(userId, "-password").lean();
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateUser = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const userId = req.params.id;
  if (decoded.role !== "admin" && decoded.userId !== userId) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const { username, email, role, password, currentPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (password) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required to change password" });
      }
      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }
      user.password = await bcrypt.hash(password, 10);
    }

    if (username) user.username = username;
    if (email) user.email = email;

    // Only admins can update role
    if (role) {
      if (decoded.role !== "admin") {
        return res.status(403).json({ message: "Forbidden to change role" });
      }
      user.role = role;
    }

    await user.save();
    res.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const deleteUser = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  if (decoded.role !== "admin") {
    return res.status(403).json({ message: "Forbidden: Admins only" });
  }

  const userId = req.params.id;

  try {
    await User.findByIdAndDelete(userId);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getUsers, getUserById, updateUser, deleteUser };
