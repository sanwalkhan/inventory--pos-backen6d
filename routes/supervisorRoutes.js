const express = require('express');
const router = express.Router();
const { 
  getDashboardStats,
  getCashierMonitoringData,
  sendMessageToCashier,
  getActiveCashiers,
  forceStopScreenShare,
  getCashierAnalytics,
  getCashierSessions,
  getCashierStatsBYid,
  getCashierStats,
  getSalesTrends,
  getHourlyPerformance,
  getCashierRankings
 
} = require("../controllers/supervisorController");



router.get('/supervisor/cashier-sessions', getCashierSessions);
router.get('/supervisor/cashier-stats', getCashierStats);

// Dashboard stats
router.get('/supervisor/dashboard-stats', getDashboardStats);

// Active cashiers
router.get('/supervisor/active-cashiers', getActiveCashiers);

// Cashier monitoring data
router.get('/supervisor/cashier-monitoring/:cashierId', getCashierMonitoringData);

// Send message to cashier
router.post('/supervisor/send-message', sendMessageToCashier);

// Force stop screen sharing
router.post('/supervisor/force-stop-screen-share/:cashierId', forceStopScreenShare);

// Cashier analytics
router.get('/supervisor/cashier-analytics/:cashierId', getCashierAnalytics);

router.get('/supervisor/active-cashier-sessions', getCashierStatsBYid);
router.get('/supervisor/sales-trends', getSalesTrends);
router.get('/supervisor/hourly-performance', getHourlyPerformance);
router.get('/supervisor/cashier-rankings', getCashierRankings);

module.exports = router;
