// routes/adminHomeRouter.js
const express = require("express");
const adminHomeRouter = express.Router();

const { adminDashboardStats } = require("../controllers/adminDashboardController");

// Dashboard stats
adminHomeRouter.get("/admin/dashboard", adminDashboardStats);



module.exports = adminHomeRouter;
