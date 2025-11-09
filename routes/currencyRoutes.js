const express = require('express');
const router = express.Router();
const currencyController = require('../controllers/currencyController');
const {authenticateToken} = require("../middleware/authmiddleware")

router.post('/currency', authenticateToken,  currencyController.addCurrency);
router.put('/currency',authenticateToken, currencyController.updateCurrency);
router.get('/currency',authenticateToken, currencyController.getCurrancy);

module.exports = router;