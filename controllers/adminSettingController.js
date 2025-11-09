const User = require("../models/userModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { getOrganizationId } = require("../middleware/authmiddleware");
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
    return decoded; // { userId, username, role, organizationId }
  } catch (error) {
    res.status(403).json({ message: "Invalid or expired token" });
    return null;
  }
}

// Get organization ID from request
function getRequestOrganizationId(req, decoded) {
  return req.organizationId || decoded.organizationId || getOrganizationId(req);
}

// Roles that managers can access/manage (excluding admin and manager roles)
const allowedManagerRoles = ["supervisor", "cashier"];

/**
 * Get all users based on current user's role and organization
 */
const getUsers = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const organizationId = getRequestOrganizationId(req, decoded);
  
  if (!organizationId) {
    return res.status(400).json({ message: "Organization ID is required" });
  }

  try {
    let roleFilter = {};
    let excludeSelf = { _id: { $ne: decoded.userId } };

    if (decoded.role === "admin") {
      // Admin sees manager, supervisor, cashier roles (excluding themselves)
      roleFilter = { role: { $in: ["manager", "supervisor", "cashier"] } };
    } else if (decoded.role === "manager") {
      // Manager sees supervisor and cashier roles only
      roleFilter = { role: { $in: allowedManagerRoles } };
    } else {
      return res.status(403).json({ message: "Forbidden: Admins or Managers only" });
    }

    const users = await User.find(
      { 
        organizationId,
        ...roleFilter,
        ...excludeSelf
      },
      "-password"
    ).lean();

    res.json({ 
      users,
      organizationId,
      total: users.length
    });
  } catch (error) {
    console.error("Fetch users error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get user by ID with permission checks and organization isolation
 */
const getUserById = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const organizationId = getRequestOrganizationId(req, decoded);
  const userId = req.params.id;

  if (!organizationId) {
    return res.status(400).json({ message: "Organization ID is required" });
  }

  try {
    const user = await User.findOne({ 
      _id: userId, 
      organizationId 
    }, "-password").lean();

    if (!user) {
      return res.status(404).json({ message: "User not found in your organization" });
    }

    // Allow users to access their own profile regardless of role
    if (decoded.userId === userId) {
      return res.json(user);
    }
    
    // Admin can access all users in their organization
    if (decoded.role === "admin") {
      return res.json(user);
    }
    
    // Manager can access users with allowed roles only in their organization
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
 * Update user with role-based permissions and organization isolation
 */
const updateUser = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const organizationId = getRequestOrganizationId(req, decoded);
  const userId = req.params.id;

  if (!organizationId) {
    return res.status(400).json({ message: "Organization ID is required" });
  }

  try {
    const user = await User.findOne({ 
      _id: userId, 
      organizationId 
    });

    if (!user) {
      return res.status(404).json({ message: "User not found in your organization" });
    }

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
    
    res.json({ 
      message: "User updated successfully",
      userId: user._id
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field} already exists in this organization` 
      });
    }
    console.error("Update user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Delete user with permission checks and organization isolation
 */
const deleteUser = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const organizationId = getRequestOrganizationId(req, decoded);
  const userId = req.params.id;

  if (!organizationId) {
    return res.status(400).json({ message: "Organization ID is required" });
  }

  if (decoded.role !== "admin" && decoded.role !== "manager") {
    return res.status(403).json({ message: "Forbidden: Admins or Managers only" });
  }

  try {
    const user = await User.findOne({ 
      _id: userId, 
      organizationId 
    });

    if (!user) {
      return res.status(404).json({ message: "User not found in your organization" });
    }

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

    await User.findOneAndDelete({ 
      _id: userId, 
      organizationId 
    });

    res.json({ 
      message: "User deleted successfully",
      deletedUserId: userId
    });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Create new user with role-based permissions and organization isolation
 */
const createUser = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const organizationId = getRequestOrganizationId(req, decoded);

  if (!organizationId) {
    return res.status(400).json({ message: "Organization ID is required" });
  }

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
    // Check if user already exists in this organization
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }],
      organizationId 
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: "User with this email or username already exists in your organization" 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user with organization ID
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role,
      organizationId,
      createdBy: decoded.userId
    });

    await newUser.save();

    res.status(201).json({ 
      message: "User created successfully",
      userId: newUser._id,
      username: newUser.username,
      role: newUser.role
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ 
        message: `${field === 'email' ? 'Email' : 'Username'} already exists in this organization` 
      });
    }
    console.error("Create user error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get user statistics based on current user's role and organization
 */
const getUserStats = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  const organizationId = getRequestOrganizationId(req, decoded);

  if (!organizationId) {
    return res.status(400).json({ message: "Organization ID is required" });
  }

  if (decoded.role !== "admin" && decoded.role !== "manager") {
    return res.status(403).json({ message: "Forbidden: Admins or Managers only" });
  }

  try {
    let roleQuery = {};
    
    if (decoded.role === "admin") {
      // Admin sees manager, supervisor, cashier
      roleQuery = { role: { $in: ["manager", "supervisor", "cashier"] } };
    } else if (decoded.role === "manager") {
      // Manager sees supervisor, cashier
      roleQuery = { role: { $in: allowedManagerRoles } };
    }

    const stats = await User.aggregate([
      { 
        $match: { 
          organizationId,
          ...roleQuery
        } 
      },
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
      cashier: 0,
      organizationId
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

/**
 * Get current user profile (for any authenticated user)
 */
const getMyProfile = async (req, res) => {
  const decoded = verifyTokenFromHeader(req, res);
  if (!decoded) return;

  try {
    const user = await User.findById(decoded.userId, "-password").lean();
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      userId: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error("Get profile error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { 
  getUsers, 
  getUserById, 
  updateUser, 
  deleteUser, 
  createUser,
  getUserStats,
  getMyProfile
};