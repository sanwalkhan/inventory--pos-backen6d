const bcrypt = require("bcrypt");
const User = require("../models/userModel");

// Fetch all users with pagination, search, and role filtering
const getAllUsers = async (req, res) => {
  try {
    console.log("👉 Fetching all users with pagination");
    
    // Extract query parameters with defaults
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const search = req.query.search || "";
    const role = req.query.role;

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Build the filter object
    let filter = { 
      role: { $in: ["cashier", "manager", "supervisor"] } 
    };

    // Add search filter if provided
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    // Add role filter if provided
    if (role && role !== "all") {
      filter.role = role;
    }

    // Get total count for pagination info
    const totalItems = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / limit);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    // Fetch users with pagination
    const users = await User.find(filter)
      .select("-password -__v -refundPassword")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get user statistics (for the entire collection, not just current page)
    const [totalUsersCount, activeUsersCount, managersCount, cashiersCount] = await Promise.all([
      User.countDocuments({ role: { $in: ["cashier", "manager", "supervisor"] } }),
      User.countDocuments({ role: { $in: ["cashier", "manager", "supervisor"] }, active: true }),
      User.countDocuments({ role: "manager" }),
      User.countDocuments({ role: "cashier" })
    ]);

    const stats = {
      total: totalUsersCount,
      active: activeUsersCount,
      managers: managersCount,
      cashiers: cashiersCount
    };

    // Pagination info
    const pagination = {
      currentPage: page,
      totalPages,
      totalItems,
      itemsPerPage: limit,
      hasNext,
      hasPrev
    };

    console.log("✅ Users fetched:", users.length, "out of", totalItems);
    
    res.status(200).json({ 
      users, 
      pagination,
      stats
    });
  } catch (error) {
    console.error("❌ Error fetching users:", error.message);
    res.status(500).json({ 
      message: "Server error while fetching users", 
      error: error.message 
    });
  }
};

// Update user info with optional password hashing
// Updating user with activation state and permissions
const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    console.log("req.body", req.body);

    const { username, email, password, role, active, permissions, refundPassword } = req.body;

    // Build update object dynamically
    const updateData = { username, email, role, active, permissions };

    // Hash new password if provided
    if (password) {
      const salt = await bcrypt.genSalt(10);
      updateData.password = await bcrypt.hash(password, salt);
    }

    // Hash refund password if provided
    if (refundPassword) {
      const salt = await bcrypt.genSalt(10);
      updateData.refundPassword = await bcrypt.hash(refundPassword, salt);
    }

    // Remove undefined values
    Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);

    // Update user in DB
    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -__v -refundPassword"); // exclude sensitive fields

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
    const { username, email, password, role, active, permissions, refundPassword } = req.body;

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

    const newUserData = {
      username,
      email,
      password: hashedPassword,
      role: role || "cashier",
      active: active !== undefined ? active : true,
      permissions: permissions || []
    };

    // Hash refund password if provided
    if (refundPassword) {
      const refundSalt = await bcrypt.genSalt(10);
      newUserData.refundPassword = await bcrypt.hash(refundPassword, refundSalt);
    }

    const newUser = new User(newUserData);
    await newUser.save();

    // Exclude sensitive fields from response
    const { password: _, __v, refundPassword: __, ...userData } = newUser.toObject();

    res.status(201).json({ 
      message: "User added successfully", 
      user: userData 
    });
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

const getcurrentUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    res.status(200).json({ user });
  } catch (error) {
    console.error("Get current user error:", error.message);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  getAllUsers,
  updateUser,
  addUser,
  deleteUser,
  getcurrentUser
};