const reportRouter = require("express").Router();
const {
  getSalesSummary,
  getTopProductsByPeriod,
  getSalesByDateRange,
  getProductSalesOverview,
  getBestProductByDate,
  getProductsSoldBetweenDates,
  getAvailableHsCodes,
  getSalesByHsCode,
  getCategoriesWithHsCodes,
  getSubcategoriesByCategoryWithHsCodes
} = require("../controllers/reportController");

reportRouter.get("/SalesReports", getSalesSummary);
reportRouter.get("/TopProducts", getTopProductsByPeriod);
reportRouter.get("/SalesByDateRange", getSalesByDateRange);
reportRouter.get("/ProductSalesOverview", getProductSalesOverview);
reportRouter.get("/ProductSalesByDateRange", getProductsSoldBetweenDates);
reportRouter.get("/AvailableHsCodes", getAvailableHsCodes);
reportRouter.get("/SalesByHsCode", getSalesByHsCode);
reportRouter.get("/CategoriesWithHsCodes", getCategoriesWithHsCodes);
reportRouter.get("/SubcategoriesByCategory/:categoryId", getSubcategoriesByCategoryWithHsCodes);

module.exports = reportRouter;
