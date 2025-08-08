// controllers/refundPasswordController.js
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { jwtConfig } = require("../config");
const { RefundPassword } = require("../models/refundPasswordModel");

// Helper to verify admin token
const verifyAdmin = (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Authorization token missing" });
    return null;
  }
  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, jwtConfig.secret);
    if (decoded.role !== "admin") {
      res.status(403).json({ message: "Forbidden: Admins only" });
      return null;
    }
    return decoded;
  } catch (error) {
    res.status(403).json({ message: "Invalid or expired token" });
    return null;
  }
};

const getRefundPassword = async (req, res) => {
  if (!verifyAdmin(req, res)) return;

  try {
    const record = await RefundPassword.findOne();
    if (!record) return res.status(404).json({ message: "Refund password not set" });

    // Only return a message, not the hash
    res.json({ message: "Refund password is set" });
  } catch (error) {
    console.error("Error getting refund password:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const createRefundPassword = async (req, res) => {
  if (!verifyAdmin(req, res)) return;

  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ message: "Password is required and should be at least 8 characters" });
  }

  try {
    const existing = await RefundPassword.findOne();
    if (existing) {
      return res.status(400).json({ message: "Refund password already exists. Use update endpoint." });
    }
    const hash = await bcrypt.hash(password, 10);
    const newPwd = new RefundPassword({ passwordHash: hash });
    await newPwd.save();
    res.status(201).json({ message: "Refund password created" });
  } catch (error) {
    console.error("Error creating refund password:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateRefundPassword = async (req, res) => {
  if (!verifyAdmin(req, res)) return;

  const { password } = req.body;
  if (!password || password.length < 8) {
    return res.status(400).json({ message: "Password is required and should be at least 8 characters" });
  }

  try {
    const record = await RefundPassword.findOne();
    if (!record) {
      return res.status(404).json({ message: "Refund password not set, create first" });
    }
    record.passwordHash = await bcrypt.hash(password, 10);
    await record.save();
    res.json({ message: "Refund password updated" });
  } catch (error) {
    console.error("Error updating refund password:", error);
    res.status(500).json({ message: "Server error" });
  }
};

const deleteRefundPassword = async (req, res) => {
  if (!verifyAdmin(req, res)) return;

  try {
    const record = await RefundPassword.findOne();
    if (!record) {
      return res.status(404).json({ message: "Refund password not found" });
    }
    await RefundPassword.deleteOne({ _id: record._id });
    res.json({ message: "Refund password deleted" });
  } catch (error) {
    console.error("Error deleting refund password:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  getRefundPassword,
  createRefundPassword,
  updateRefundPassword,
  deleteRefundPassword,
};
