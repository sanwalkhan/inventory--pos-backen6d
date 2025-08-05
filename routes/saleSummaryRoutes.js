const express = require("express");
const { getSalesSummary } = require("../controllers/salesummaryController");
const saleSummaryRouter = express.Router();

saleSummaryRouter.get("/SalesSummary", getSalesSummary);

module.exports = saleSummaryRouter;