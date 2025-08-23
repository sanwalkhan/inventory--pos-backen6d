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

// Roles that managers can access/manage (excluding admin and manager roles)
const allowedManagerRoles = ["supervisor", "cashier"];

/**
 * Get all users based on current user's role
 * Admin: can see manager, supervisor, cashier (excluding themselves and other admins)
 * Manager: can see supervisor, cashier only
 */
const getUsers = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  if (decoded.role === "admin") {
    try {
      // Admin sees manager, supervisor, cashier roles (excluding themselves)
      const users = await User.find(
        { 
          role: { $in: ["manager", "supervisor", "cashier"] },
          _id: { $ne: decoded.userId }
        },
        "-password"
      ).lean();
      res.json({ users });
    } catch (error) {
      console.error("Fetch users error:", error);
      res.status(500).json({ message: "Server error" });
    }
  } else if (decoded.role === "manager") {
    try {
      // Manager sees supervisor and cashier roles only
      const users = await User.find({ 
        role: { $in: allowedManagerRoles },
        _id: { $ne: decoded.userId }
      }, "-password").lean();
      res.json({ users });
    } catch (error) {
      console.error("Fetch users error:", error);
      res.status(500).json({ message: "Server error" });
    }
  } else {
    res.status(403).json({ message: "Forbidden: Admins or Managers only" });
  }
};

/**
 * Get user by ID with permission checks
 */
const getUserById = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const userId = req.params.id;
  try {
    const user = await User.findById(userId, "-password").lean();
    if (!user) return res.status(404).json({ message: "User not found" });

    // Allow users to access their own profile regardless of role
    if (decoded.userId === userId) {
      return res.json(user);
    }
    
    // Admin can access all users
    if (decoded.role === "admin") {
      return res.json(user);
    }
    
    // Manager can access users with allowed roles only
    if (decoded.role === "manager") {
      if (!allowedManagerRoles.includes(user.role)) {
        return res.status(403).json({ message: "Forbidden: Manager access denied" });
      }
      return res.json(user);
    }
    
    // All other cases are forbidden
    return res.status(403).json({ message: "Forbidden" });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update user with role-based permissions
 */
const updateUser = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const userId = req.params.id;
  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Permission checks
    let canUpdate = false;
    let canChangeRole = false;

    if (decoded.userId === userId) {
      canUpdate = true;
    } else if (decoded.role === "admin") {
      canUpdate = true;
      canChangeRole = true;
    } else if (decoded.role === "manager" && allowedManagerRoles.includes(user.role)) {
      canUpdate = true;
    }

    if (!canUpdate) {
      return res.status(403).json({ message: "Forbidden: Cannot update this user" });
    }

    // Prevent unauthorized role changes
    if (req.body.role && req.body.role !== user.role && !canChangeRole) {
      return res.status(403).json({ message: "Forbidden: Cannot change role" });
    }

    const { username, email, role, password, currentPassword, refundPassword } = req.body;

    // Conditional validation for username/email
    if (("username" in req.body && !username) || ("email" in req.body && !email)) {
      return res.status(400).json({ message: "Username and email cannot be empty" });
    }

    // Password update
    if (password) {
      if (decoded.userId === userId && !currentPassword) {
        return res.status(400).json({ message: "Current password is required to change password" });
      }

      if (decoded.userId === userId) {
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
          return res.status(400).json({ message: "Current password is incorrect" });
        }
      }

      user.password = await bcrypt.hash(password, 10);
    }

    // Refund password update (independent)
    if (refundPassword) {
      user.refundPassword = await bcrypt.hash(refundPassword, 10);
    }

    if (username) user.username = username;
    if (email) user.email = email;
    if (role && canChangeRole) user.role = role;

    await user.save();
    res.json({ message: "User updated successfully" });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ message: `${field} already exists` });
    }
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


/**
 * Delete user with permission checks
 */
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

    // Users cannot delete themselves
    if (decoded.userId === userId) {
      return res.status(403).json({ message: "Forbidden: Cannot delete yourself" });
    }

    // Check manager permissions
    if (decoded.role === "manager") {
      if (!allowedManagerRoles.includes(user.role)) {
        return res.status(403).json({ message: "Forbidden: Manager cannot delete this user" });
      }
    }

    await User.findByIdAndDelete(userId);
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Create new user with role-based permissions
 */
const createUser = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  if (decoded.role !== "admin" && decoded.role !== "manager") {
    return res.status(403).json({ message: "Forbidden: Admins or Managers only" });
  }

  const { username, email, password, role } = req.body;

  // Validate required fields
  if (!username || !email || !password || !role) {
    return res.status(400).json({ message: "All fields are required" });
  }

  // Validate password length
  if (password.length < 6) {
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  }

  // Check role permissions
  if (decoded.role === "admin") {
    // Admin can create manager, supervisor, cashier roles
    if (!["manager", "supervisor", "cashier"].includes(role)) {
      return res.status(400).json({ message: "Invalid role for admin" });
    }
  } else if (decoded.role === "manager") {
    // Manager can create supervisor and cashier roles only
    if (!allowedManagerRoles.includes(role)) {
      return res.status(403).json({ message: "Forbidden: Manager cannot create users with this role" });
    }
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        message: "User with this email or username already exists" 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role
    });

    await newUser.save();
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    if (error.code === 11000) {
      // Duplicate key error
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field === 'email' ? 'Email' : 'Username'} already exists` 
      });
    }
    console.error("Create user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get user statistics based on current user's role
 */
const getUserStats = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  if (decoded.role !== "admin" && decoded.role !== "manager") {
    return res.status(403).json({ message: "Forbidden: Admins or Managers only" });
  }

  try {
    let query = {};
    
    if (decoded.role === "admin") {
      // Admin sees manager, supervisor, cashier
      query = { role: { $in: ["manager", "supervisor", "cashier"] } };
    } else if (decoded.role === "manager") {
      // Manager sees supervisor, cashier
      query = { role: { $in: allowedManagerRoles } };
    }

    const stats = await User.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 }
        }
      }
    ]);

    const formattedStats = {
      total: 0,
      manager: 0,
      supervisor: 0,
      cashier: 0
    };

    stats.forEach(stat => {
      formattedStats[stat._id] = stat.count;
      formattedStats.total += stat.count;
    });

    res.json(formattedStats);
  } catch (error) {
    console.error("Get user stats error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { 
  getUsers, 
  getUserById, 
  updateUser, 
  deleteUser, 
  createUser,
  getUserStats
};