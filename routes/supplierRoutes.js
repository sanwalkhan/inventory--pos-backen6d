const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');
const { authenticateToken } = require('../middleware/authmiddleware');

// Supplier CRUD routes
router.post('/supplier',authenticateToken, supplierController.createSupplier);
router.get('/supplier',authenticateToken, supplierController.getSuppliers);
router.get('/supplier/:id',authenticateToken, supplierController.getSupplierById);
router.put('/supplier/:id',authenticateToken, supplierController.updateSupplier);
router.delete('/supplier/:id',authenticateToken, supplierController.deleteSupplier);

// Order management routes
router.post('/supplier/:id/orders',authenticateToken, supplierController.addOrder);
router.put('/supplier/:supplierId/orders/:orderId/payment',authenticateToken, supplierController.updateOrderPayment);
router.delete('/supplier/:supplierId/orders/:orderId',authenticateToken, supplierController.deleteOrder);

// Product receiving routes
router.post('/supplier/:supplierId/orders/:orderId/receive',authenticateToken, supplierController.receiveProducts);

// Dues management routes
router.post('/supplier/:id/clear-all-dues',authenticateToken, supplierController.clearAllDues);

// History and reporting routes
router.get('/supplier/:id/history',authenticateToken, supplierController.getSupplierHistory);

module.exports = router;