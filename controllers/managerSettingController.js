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

const allowedManagerRoles = ["supervisor", "cashier"];

// Get all users (admin: all; manager: supervisor and cashier only)
const getUsers = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  try {
    let users;
    if (decoded.role === "admin") {
      users = await User.find({}, "-password").lean();
    } else if (decoded.role === "manager") {
      users = await User.find(
        { role: { $in: allowedManagerRoles } },
        "-password"
      ).lean();
    } else {
      return res.status(403).json({ message: "Forbidden: Insufficient rights" });
    }

    res.json({ users });
  } catch (error) {
    console.error("Fetch users error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get user by ID, with role-based access
const getUserById = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const userId = req.params.id;

  try {
    const user = await User.findById(userId, "-password").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    if (decoded.role === "admin") {
      return res.json(user);
    }

    if (decoded.role === "manager") {
      if (!allowedManagerRoles.includes(user.role))
        return res.status(403).json({ message: "Forbidden: Manager access denied" });
      return res.json(user);
    }

    if (decoded.userId !== userId) {
      return res.status(403).json({ message: "Forbidden" });
    }

    res.json(user);
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Update user with role-based permission checks
const updateUser = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const userId = req.params.id;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (decoded.role === "admin") {
      // Allowed to update all
    } else if (decoded.role === "manager") {
      if (!allowedManagerRoles.includes(user.role))
        return res.status(403).json({ message: "Forbidden: Manager cannot modify this user" });
      if (req.body.role && req.body.role !== user.role)
        return res.status(403).json({ message: "Forbidden: Manager cannot change role" });
    } else {
      if (decoded.userId !== userId)
        return res.status(403).json({ message: "Forbidden" });
      if (req.body.role && req.body.role !== user.role)
        return res.status(403).json({ message: "Forbidden to change role" });
    }

    const { username, email, role, password, currentPassword } = req.body;

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

    if (role && decoded.role === "admin") {
      user.role = role;
    }

    await user.save();
    res.json({ message: "User updated successfully" });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete user with role checks
const deleteUser = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  if (decoded.role !== "admin" && decoded.role !== "manager") {
    return res.status(403).json({ message: "Forbidden: Admins or Managers only" });
  }

  const userId = req.params.id;

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (decoded.role === "manager" && !allowedManagerRoles.includes(user.role)) {
      return res.status(403).json({ message: "Forbidden: Manager cannot delete this user" });
    }

    await User.findByIdAndDelete(userId);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { getUsers, getUserById, updateUser, deleteUser };
