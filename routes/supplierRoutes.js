const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');

// Supplier CRUD routes
router.post('/supplier', supplierController.createSupplier);
router.get('/supplier', supplierController.getSuppliers);
router.get('/supplier/:id', supplierController.getSupplierById);
router.put('/supplier/:id', supplierController.updateSupplier);
router.delete('/supplier/:id', supplierController.deleteSupplier);

// Order management routes
router.post('/supplier/:id/orders', supplierController.addOrder);
router.put('/supplier/:supplierId/orders/:orderId/payment', supplierController.updateOrderPayment);
router.delete('/supplier/:supplierId/orders/:orderId', supplierController.deleteOrder);

// Product receiving routes
router.post('/supplier/:supplierId/orders/:orderId/receive', supplierController.receiveProducts);

// Dues management routes
router.post('/supplier/:id/clear-all-dues', supplierController.clearAllDues);

// History and reporting routes
router.get('/supplier/:id/history', supplierController.getSupplierHistory);

module.exports = router;