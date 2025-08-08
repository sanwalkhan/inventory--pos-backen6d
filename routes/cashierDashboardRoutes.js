const express = require("express");
const router = express.Router();
const controller = require("../controllers/cashierDashboardController");

// Stats for cashier dashboard
router.get("/cashier/stats/:cashierId", controller.getCashierStats);

// Recent transactions for cashier
router.get("/cashier/transactions/:cashierId/recent", controller.getRecentTransactions);

// Latest products added in last 3 days
router.get("/cashier/products/latest", controller.getLatestProducts);

// Orders by cashier for receipts
router.get("/orders/cashier/:cashierId", controller.getOrdersByCashier);

// Get product by barcode for scanner
router.get("/cashier/products/barcode/:barcode", controller.getProductByBarcode);

module.exports = router;
