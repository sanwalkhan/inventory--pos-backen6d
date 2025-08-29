const reportRouter = require("express").Router();
const {
  getSalesSummary,
  getTopProductsByPeriod,
  getSalesByDateRange,
  getProductSalesOverview,
  getBestProductByDate,
  getProductsSoldBetweenDates,
} = require("../controllers/reportController");

reportRouter.get("/SalesReports", getSalesSummary);
reportRouter.get("/TopProducts", getTopProductsByPeriod);
reportRouter.get("/SalesByDateRange", getSalesByDateRange);
reportRouter.get("/ProductSalesOverview", getProductSalesOverview);
reportRouter.get("/ProductSalesByDateRange", getProductsSoldBetweenDates);

module.exports = reportRouter;