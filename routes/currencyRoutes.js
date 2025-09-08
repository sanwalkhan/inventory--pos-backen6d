const express = require('express');
const router = express.Router();
const currencyController = require('../controllers/currencyController');

router.put('/currency', currencyController.updateCurrency);
router.get('/currency', currencyController.getCurrancy);

module.exports = router;