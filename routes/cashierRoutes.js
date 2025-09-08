const express = require('express');
const router = express.Router();
const cashierController = require('../controllers/cashierController');

// Session management routes
// Session management routes
router.post('/cashier/checkin', cashierController.checkIn);
router.post('/cashier/checkout', cashierController.checkOut);
router.post('/cashier/auto-checkout', cashierController.autoCheckOut);
router.get('/cashier/session-status/:cashierId', cashierController.getSessionStatus);
router.get('/cashier/session-history/:cashierId', cashierController.getSessionHistory);
router.put('/cashier/screen-share/:cashierId', cashierController.updateScreenShareStatus);
router.put('/cashier/activity/:cashierId', cashierController.updateActivity);



module.exports = router;