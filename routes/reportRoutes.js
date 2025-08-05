// routes/reportRoutes.js
const reportRouter = require("express").Router();
const {
  getSalesSummary,
  getTopProductsByPeriod,
} = require("../controllers/reportController");

reportRouter.get("/SalesReports", getSalesSummary);
reportRouter.get("/TopProducts", getTopProductsByPeriod);

module.exports = reportRouter;
