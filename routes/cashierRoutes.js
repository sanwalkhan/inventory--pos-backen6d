const express = require('express');
const router = express.Router();
const cashierController = require('../controllers/cashierController');

// Session management routes
router.post('/cashier/checkin', cashierController.checkIn);
router.post('/cashier/checkout', cashierController.checkOut);
router.get('/cashier/session-status/:cashierId', cashierController.getSessionStatus);
router.get('/cashier/session-history/:cashierId', cashierController.getSessionHistory);



module.exports = router;