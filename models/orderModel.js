const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Products",
    required: true,
  },
  name: { type: String, required: true },
  sellingPrice: { type: Number, required: true }, // Changed from 'price' to 'sellingPrice' to match frontend
  quantity: { type: Number, required: true },
});

const OrderSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  cashierId: { type: String, required: true },
  date: { type: Date, required: true },
  items: [OrderItemSchema],
  totalPrice: { type: Number, required: true },
  paymentMethod: { 
    type: String, 
    enum: ["cash", "card", "mobile"], 
    required: true 
  },
}, {
  timestamps: true // Automatically adds createdAt and updatedAt
});

const Order = mongoose.model("Order", OrderSchema);
module.exports = { Order };