const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplierController');

router.post('/supplier', supplierController.createSupplier);
router.get('/supplier', supplierController.getSuppliers);
router.put('/supplier/:id', supplierController.updateSupplier);
router.delete('/supplier/:id', supplierController.deleteSupplier);
router.post('/supplier/:id/clear-dues', supplierController.clearDues);
router.post('/supplier/:id/orders', supplierController.addOrder);
router.put('/supplier/:supplierId/orders/:orderId', supplierController.editOrderDue);
router.post('/supplier/:id/clear-all-dues', supplierController.clearAllDues);

module.exports = router;
