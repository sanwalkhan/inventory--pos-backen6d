const reportRouter = require("express").Router();
const {
  getSalesSummary,
  getTopProductsByPeriod,
  getSalesByDateRange,
  getProductSalesOverview,
  getBestProductByDate,
} = require("../controllers/reportController");

reportRouter.get("/SalesReports", getSalesSummary);
reportRouter.get("/TopProducts", getTopProductsByPeriod);
reportRouter.get("/SalesByDateRange", getSalesByDateRange);
reportRouter.get("/ProductSalesOverview", getProductSalesOverview);
reportRouter.get("/BestProductByDate", getBestProductByDate);

module.exports = reportRouter;