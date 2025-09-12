const Users = require("../models/userModel");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
require("dotenv").config({ path: ".env" });

// Configure email transporter for sending emails
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: 'shahshahzaibkazmi@gmail.com', // Your email address
    pass: 'fssm orjq hqjo riir', // Your email app password or SMTP password
  },
});

// Helper function to send email
async function sendEmail({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"Smart Mart" <shahshahzaibkazmi@gmail.com>`,
      to,
      subject,
      html,
    });
    console.log("Email sent: ", info.messageId);
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

// Send password reset email
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const user = await Users.findOne({ email });

    if (!user) {
      // For security, do not reveal if email does not exist
      return res.status(404).json({ message: "Email not found" });
    }

    // Create a JWT reset token valid for 1 hour
    const resetToken = jwt.sign(
      { id: user._id },
      process.env.JWT_RESET_SECRET, // JWT_RESET_SECRET
      { expiresIn: "1h" }
    );

    // Create reset URL for frontend
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    // Email HTML content
    const emailHtml = `
      <h2>Password Reset Request</h2>
      <p>You requested a password reset for your Smart Mart account. Click the link below to reset your password (valid for 1 hour):</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>If you did not request this, please ignore this email.</p>
    `;

    await sendEmail({
      to: user.email,
      subject: "Smart Mart Password Reset Instructions",
      html: emailHtml,
    });

    return res.status(200).json({ message: "Password reset instructions sent to your email." });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

// Validate reset token (GET)
exports.validateResetToken = (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(400).json({ message: "No token provided" });
  }

  try {
    jwt.verify(token, process.env.JWT_RESET_SECRET);
    return res.status(200).json({ message: "Token is valid" });
  } catch (error) {
    return res.status(400).json({ message: "Invalid or expired reset token" });
  }
};

// Reset password (POST)
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: "Missing token or password" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_RESET_SECRET);
    const userId = decoded.id;

    const user = await Users.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash the new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    user.password = hashedPassword;
    user.resetToken = null;
    await user.save();

    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ message: error.message || "Reset failed" });
  }
};
