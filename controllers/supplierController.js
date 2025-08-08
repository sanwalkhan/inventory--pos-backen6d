const Supplier = require('../models/supplierModel');

exports.createSupplier = async (req, res) => {
  try {
    const supplier = new Supplier(req.body);
    await supplier.save();
    res.status(201).json(supplier);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getSuppliers = async (req, res) => {
  try {
    const suppliers = await Supplier.find();
    res.json(suppliers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(supplier);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteSupplier = async (req, res) => {
  try {
    await Supplier.findByIdAndDelete(req.params.id);
    res.json({ message: 'Supplier deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Additional controller action to clear dues
exports.clearDues = async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await Supplier.findById(id);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    supplier.dues = 0;
    await supplier.save();
    res.json({ message: 'Dues cleared', supplier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
exports.addOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { orderId, items, totalAmount, paidAmount } = req.body;
    const supplier = await Supplier.findById(id);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const dueAmount = totalAmount - paidAmount;
    supplier.orders.push({ orderId, items, totalAmount, paidAmount, dueAmount });
    supplier.dues += dueAmount;
    await supplier.save();

    res.status(201).json(supplier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Edit dues for an order
exports.editOrderDue = async (req, res) => {
  try {
    const { supplierId, orderId } = req.params;
    const { paidAmount } = req.body;

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const order = supplier.orders.id(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Calculate new due and update supplier total dues accordingly
    const oldDue = order.dueAmount;
    order.paidAmount = paidAmount;
    order.dueAmount = order.totalAmount - paidAmount;

    // update overall dues
    supplier.dues += (order.dueAmount - oldDue);
    await supplier.save();

    res.json(supplier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Clear all dues for supplier
exports.clearAllDues = async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await Supplier.findById(id);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    supplier.orders.forEach(order => {
      order.paidAmount = order.totalAmount;
      order.dueAmount = 0;
    });
    supplier.dues = 0;
    await supplier.save();

    res.json({ message: 'All dues cleared', supplier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
