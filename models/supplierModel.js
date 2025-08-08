const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true },
  items: [{ name: String, quantity: Number, price: Number }],
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },
  orderDate: { type: Date, default: Date.now }
});

const SupplierSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact: String,
  orders: [OrderSchema],  // embed orders per supplier
  dues: { type: Number, default: 0 }, // total dues summary
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Supplier', SupplierSchema);
