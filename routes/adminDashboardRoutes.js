// routes/adminHomeRouter.js
const express = require("express");
const adminHomeRouter = express.Router();

const { adminDashboardStats } = require("../controllers/adminDashboardController");
const {
  getRefundPassword,
  createRefundPassword,
  updateRefundPassword,
  deleteRefundPassword,
} = require("../controllers/refundPasswordController");

// Dashboard stats
adminHomeRouter.get("/admin/dashboard", adminDashboardStats);

// Refund password CRUD
adminHomeRouter.get("/refund-password", getRefundPassword);
adminHomeRouter.post("/refund-password", createRefundPassword);
adminHomeRouter.put("/refund-password", updateRefundPassword);
adminHomeRouter.delete("/refund-password", deleteRefundPassword);

module.exports = adminHomeRouter;
