const User = require("../models/userModel");
const Organization = require("../models/organizationModel");
const OTP = require("../models/otpmodel");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const { jwtConfig } = require("../config");

// Create transporter for sending emails
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
      user: process.env.SYSTEM_EMAIL,
      pass: process.env.SYSTEM_EMAIL_PASSWORD,
    },
  });
};

// Generate random 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Clean up unverified users older than one week
const cleanupUnverifiedUsers = async () => {
  try {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    // Find unverified users created more than one week ago
    const unverifiedUsers = await User.find({
      verified: false,
      createdAt: { $lt: oneWeekAgo }
    });

    for (const user of unverifiedUsers) {
      // Delete associated organization
      await Organization.findByIdAndDelete(user.organizationId);
      
      // Delete any OTP records for this email
      await OTP.deleteMany({ email: user.email });
      
      // Delete the user
      await User.findByIdAndDelete(user._id);
      
      console.log(`🧹 Cleaned up unverified user: ${user.email}`);
    }

    if (unverifiedUsers.length > 0) {
      console.log(`✅ Cleaned up ${unverifiedUsers.length} unverified users`);
    }
  } catch (error) {
    console.error('❌ Error cleaning up unverified users:', error);
  }
};

// Check OTP requests limit (5 per week)
const checkOTPRequestLimit = async (email) => {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  
  const recentRequests = await User.aggregate([
    { $match: { email } },
    { $unwind: "$otpRequests" },
    { $match: { "otpRequests.timestamp": { $gte: oneWeekAgo } } },
    { $group: { _id: null, totalCount: { $sum: "$otpRequests.count" } } }
  ]);

  return recentRequests.length > 0 ? recentRequests[0].totalCount < 5 : true;
};

// Send OTP email
const sendOTPEmail = async (email, otpCode) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.SYSTEM_EMAIL,
      to: email,
      subject: 'Smart Mart - Email Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333; text-align: center;">Smart Mart Verification</h2>
          <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; text-align: center;">
            <h3 style="color: #555;">Your Verification Code</h3>
            <div style="font-size: 32px; font-weight: bold; color: #007bff; letter-spacing: 5px; margin: 20px 0;">
              ${otpCode}
            </div>
            <p style="color: #666; margin: 10px 0;">
              This code will expire in 2 minutes.
            </p>
            <p style="color: #666; margin: 10px 0; font-size: 14px;">
              <strong>Note:</strong> Your registration will be automatically cancelled if not verified within 7 days.
            </p>
            <p style="color: #999; font-size: 12px;">
              If you didn't request this code, please ignore this email.
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ OTP sent successfully to ${email}`);
    return true;
  } catch (error) {
    console.error('❌ Error sending OTP email:', error);
    return false;
  }
};

const authController = async (req, res) => {
  try {
    const { username, password, role, email, organizationName } = req.body;

    // Run cleanup before processing new registration
    await cleanupUnverifiedUsers();

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
      if (existingUser.verified) {
        return res.status(400).json({ message: "User already exists" });
      } else {
        // If user exists but not verified, check if it's older than one week
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        if (existingUser.createdAt < oneWeekAgo) {
          // Delete old unverified user and allow re-registration
          await User.findByIdAndDelete(existingUser._id);
          await Organization.findByIdAndDelete(existingUser.organizationId);
          await OTP.deleteMany({ email });
          console.log(`🧹 Deleted old unverified user: ${email}`);
        } else {
          return res.status(400).json({ 
            message: "An unverified account already exists with this email. Please verify your email or wait for the registration to expire." 
          });
        }
      }
    }

    // Check OTP request limit
    const canRequestOTP = await checkOTPRequestLimit(email);
    if (!canRequestOTP) {
      return res.status(429).json({ 
        message: "OTP request limit exceeded. Please try again next week." 
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create organization first
    const organization = await Organization.create({
      name: organizationName,
    });

    // Create user with verified: false
    const user = await User.create({
      username,
      password: hashedPassword,
      role: role || "admin",
      email,
      organizationId: organization._id,
      verified: false,
      active: false
    });

    // Generate and send OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    // Store OTP
    await OTP.create({
      email,
      code: otpCode,
      expiresAt: otpExpires
    });

    // Record OTP request
    await User.findByIdAndUpdate(user._id, {
      $push: {
        otpRequests: {
          timestamp: new Date(),
          count: 1
        }
      }
    });

    const adminEmail = process.env.ADMIN_EMAIL;
    // Send OTP email
    const emailSent = await sendOTPEmail(adminEmail, otpCode);
    
    if (!emailSent) {
      // Clean up if email fails
      await User.findByIdAndDelete(user._id);
      await Organization.findByIdAndDelete(organization._id);
      await OTP.deleteMany({ email });
      return res.status(500).json({ 
        message: "Failed to send verification email. Please try again." 
      });
    }

    return res.status(201).json({ 
      message: "Verification code sent to your email",
      email: email,
      userId: user._id,
      note: "Please verify your email within 7 days to complete registration."
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
      message: "Server error during registration",
      error: error.message 
    });
  }
};

const verifyOTPController = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ 
        message: "Email and OTP are required" 
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Check if user registration is older than one week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (user.createdAt < oneWeekAgo && !user.verified) {
      // Clean up expired registration
      await User.findByIdAndDelete(user._id);
      await Organization.findByIdAndDelete(user.organizationId);
      await OTP.deleteMany({ email });
      return res.status(400).json({ 
        message: "Registration expired. Please sign up again." 
      });
    }

    if (user.verified) {
      return res.status(400).json({ message: "User already verified" });
    }

    // Find valid OTP
    const otpRecord = await OTP.findOne({ 
      email, 
      code: otp,
      expiresAt: { $gt: new Date() }
    });

    if (!otpRecord) {
      // Increment attempts
      await OTP.updateOne(
        { email, code: otp },
        { $inc: { attempts: 1 } }
      );

      return res.status(400).json({ 
        message: "Invalid or expired OTP" 
      });
    }

    // Verify user and activate account
    user.verified = true;
    user.active = true;
    await user.save();

    // Delete used OTP
    await OTP.deleteOne({ _id: otpRecord._id });

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        username: user.username, 
        role: user.role, 
        email: user.email, 
        organizationId: user.organizationId 
      },
      jwtConfig.secret,
      { expiresIn: jwtConfig.expire }
    );

    return res.status(200).json({
      message: "Email verified successfully",
      token,
      userId: user._id,
      role: user.role,
      organizationId: user.organizationId
    });

  } catch (error) {
    console.error("❌ OTP verification error:", error.message);
    res.status(500).json({ 
      message: "Server error during OTP verification",
      error: error.message 
    });
  }
};

const resendOTPController = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        message: "Email is required" 
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    // Check if user registration is older than one week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    if (user.createdAt < oneWeekAgo && !user.verified) {
      // Clean up expired registration
      await User.findByIdAndDelete(user._id);
      await Organization.findByIdAndDelete(user.organizationId);
      await OTP.deleteMany({ email });
      return res.status(400).json({ 
        message: "Registration expired. Please sign up again." 
      });
    }

    if (user.verified) {
      return res.status(400).json({ message: "User already verified" });
    }

    // Check OTP request limit
    const canRequestOTP = await checkOTPRequestLimit(email);
    if (!canRequestOTP) {
      return res.status(429).json({ 
        message: "OTP request limit exceeded. Please try again next week." 
      });
    }

    // Generate new OTP
    const otpCode = generateOTP();
    const otpExpires = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

    // Delete any existing OTP for this email
    await OTP.deleteMany({ email });

    // Store new OTP
    await OTP.create({
      email,
      code: otpCode,
      expiresAt: otpExpires
    });

    // Record OTP request
    await User.findByIdAndUpdate(user._id, {
      $push: {
        otpRequests: {
          timestamp: new Date(),
          count: 1
        }
      }
    });

    const adminEmail = process.env.ADMIN_EMAIL;
    // Send OTP email
    const emailSent = await sendOTPEmail(adminEmail, otpCode);
    
    if (!emailSent) {
      return res.status(500).json({ 
        message: "Failed to send verification email. Please try again." 
      });
    }

    return res.status(200).json({ 
      message: "New verification code sent to your email" 
    });

  } catch (error) {
    console.error("❌ Resend OTP error:", error.message);
    res.status(500).json({ 
      message: "Server error during OTP resend",
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

    // Check if user is verified
    if (!user.verified) {
      // Check if registration is expired
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (user.createdAt < oneWeekAgo) {
        // Clean up expired registration
        await User.findByIdAndDelete(user._id);
        await Organization.findByIdAndDelete(user.organizationId);
        await OTP.deleteMany({ email });
        return res.status(400).json({ 
          message: "Registration expired. Please sign up again." 
        });
      }
      
      return res.status(400).json({ 
        message: "Please verify your email before logging in" 
      });
    }

    // Check if user is active
    if (!user.active) {
      return res.status(400).json({ 
        message: "Your account has been deactivated. Please contact administrator." 
      });
    }

    console.log("User document:", user);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Password does not match" });
    }

    const token = jwt.sign(
      { 
        userId: user._id, 
        username: user.username, 
        role: user.role, 
        email: user.email, 
        organizationId: user.organizationId 
      },
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

// Export cleanup function for scheduled jobs
module.exports = { 
  authController, 
  loginController, 
  verifyOTPController, 
  resendOTPController,
  cleanupUnverifiedUsers
};