const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Products",
    required: true,
  },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
});

const OrderSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  cashierId: { type: String, required: true },
  cashierName: { type: String, required: true }, // ✅ ADDED userPhone
  date: { type: Date, required: true },
  items: [OrderItemSchema],
  totalPrice: { type: Number, required: true },
  paymentMethod: { type: String, enum: ["cash", "card"], required: true },
});

const Order = mongoose.model("Order", OrderSchema);
module.exports = { Order };
