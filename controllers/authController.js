const User = require("../models/userModel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken"); 
const { jwtConfig } = require("../config");
const authController = async (req, res) => {
  const { username, password, role, email } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ message: "User already exists" });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    username,
    password: hashedPassword,
    role,
    email,
  });
  user.save();
  return res
    .status(201)
    .json({ message: `User created successfully with ${user.role}` });
};

const loginController = async (req, res) => {
  try {
    const { email, password, role } = req.body;
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

    if (user.role !== role) {
      return res.status(400).json({ message: "Incorrect role" });
    }

    // ✅ Only include safe user data in token
    const token = jwt.sign(
      { userId: user._id, name: user.name, role: user.role , email: user.email},
      jwtConfig.secret,
      { expiresIn: jwtConfig.expire }
    );

    return res.status(200).json({
      message: `User logged in successfully with role ${role} and name ${user.username}`,
      token,
      userId: user._id
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { authController, loginController };
