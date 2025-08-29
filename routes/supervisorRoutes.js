const express = require('express');
const router = express.Router();
const {
  getDashboardStats,
  getCashierSessions,
  getCashierStats,
  getCashierDetails,
  forceCheckout,
  getSalesTrends,
  getHourlyPerformance,
  exportCashierData
} = require('../controllers/supervisorController');


// Dashboard statistics
router.get('/supervisor/dashboard-stats', getDashboardStats);

// Cashier sessions management
router.get('/supervisor/cashier-sessions', getCashierSessions);

// Cashier performance statistics
router.get('/supervisor/cashier-stats', getCashierStats);

// Detailed cashier information
router.get('/supervisor/cashier-details/:cashierId', getCashierDetails);

// Force checkout a cashier session
router.patch('/supervisor/force-checkout/:sessionId', forceCheckout);

// Sales trends over time
router.get('/supervisor/sales-trends', getSalesTrends);

// Hourly performance data
router.get('/supervisor/hourly-performance', getHourlyPerformance);

// Export cashier data for reporting
router.get('/supervisor/export-data', exportCashierData);

// Additional routes for comprehensive supervision




module.exports = router;

// Update session notes (supervisor can add notes