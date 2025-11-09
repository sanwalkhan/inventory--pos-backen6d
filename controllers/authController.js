const User = require("../models/userModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken"); 
const Organization = require("../models/organizationModel");
const { jwtConfig } = require("../config");
const authController = async (req, res) => {
  try {
    const { username, password, role, email, organizationName } = req.body;

    // Validate required fields
    if (!username || !password || !email || !organizationName) {
      return res.status(400).json({ 
        message: "Username, password, email, and organization name are required" 
      });
    }

    // Check if organization name already exists
    const existingOrganization = await Organization.findOne({ name: organizationName });
    if (existingOrganization) {
      return res.status(400).json({ message: "Organization name already exists" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create organization first
    const organization = await Organization.create({
      name: organizationName,
    });
    // No need to call organization.save() - create() already saves

    // Create user with organization ID
    const user = await User.create({
      username,
      password: hashedPassword,
      role: role || "admin", // Default to admin if not provided
      email,
      organizationId: organization._id, // Add organization ID to user
    });
    // No need to call user.save() - create() already saves

    return res.status(201).json({ 
      message: `User created successfully with ${user.role} role`,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId
      },
      organization: {
        id: organization._id,
        name: organization.name
      }
    });

  } catch (error) {
    console.error("❌ Auth controller error:", error.message);
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      if (error.keyPattern?.email) {
        return res.status(409).json({ 
          message: "User with this email already exists" 
        });
      }
      if (error.keyPattern?.name) {
        return res.status(409).json({ 
          message: "Organization name already exists" 
        });
      }
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(val => val.message);
      return res.status(400).json({ 
        message: "Validation error", 
        errors 
      });
    }

    res.status(500).json({ 
      message: "Server error during user creation",
      error: error.message 
    });
  }
};

const loginController = async (req, res) => {
  try {
    console.log("Request body:", req.body);
    const { email, password } = req.body;
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please provide all the required fields" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }
    console.log("User document:", user);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Password does not match" });
    }

    // No need to provide role from frontend; get from database
    const token = jwt.sign(
      { userId: user._id, name: user.name, role: user.role, email: user.email, organizationId: user.organizationId },
      jwtConfig.secret,
      { expiresIn: jwtConfig.expire }
    );

    return res.status(200).json({
      message: `User logged in successfully with role ${user.role} and name ${user.username}`,
      token,
      userId: user._id,
      role: user.role,
      organizationId: user.organizationId
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
module.exports = { authController, loginController };
