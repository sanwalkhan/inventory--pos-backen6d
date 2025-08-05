const adminHomeRouter = require("express").Router();
const {
  adminDashboardStats,
} = require("../controllers/adminDashboardController");

adminHomeRouter.get("/admin/dashboard", adminDashboardStats);

module.exports = adminHomeRouter;