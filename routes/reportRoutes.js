const reportRouter = require("express").Router();
const {
  getSalesSummary,
} = require("../controllers/reportController");

reportRouter.get("/SalesReports", getSalesSummary);

module.exports = reportRouter;