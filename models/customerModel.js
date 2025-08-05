const mongoose = require("mongoose");

const purchaseItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Products" },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
});

const orderSchema = new mongoose.Schema({
  orderDate: { type: Date, default: Date.now },
  items: [purchaseItemSchema],
});

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true },
    purchaseHistory: [orderSchema], // Array of orders, each with date and items
    purchaseCount: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

const Customer = mongoose.model("Customer", customerSchema);

module.exports = { Customer };
