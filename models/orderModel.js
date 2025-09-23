const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Products",
    required: true,
  },
  name: { type: String, required: true },
  sellingPrice: { type: Number, required: true },
  quantity: { type: Number, required: true },
  originalQuantity: { type: Number }, // For tracking refunds
});

// Refund History Schema for Orders
const OrderRefundHistorySchema = new mongoose.Schema({
  refundDate: { type: Date, required: true },
  refundedBy: { type: String, required: true },
  refundedByName: { type: String, required: true },
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Products", required: true },
    name: { type: String, required: true },
    refundedQuantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    totalRefundAmount: { type: Number, required: true }
  }],
  totalRefundAmount: { type: Number, required: true },
  reason: { type: String, default: "Customer request" }
});

const OrderSchema = new mongoose.Schema({
  userName: { type: String, required: true },
  userPhone: { type: String, required: true },
  cashierId: { type: String, required: true },
  cashierName: { type: String, required: true },
  date: { type: Date, required: true },
  items: [OrderItemSchema],
  totalPrice: { type: Number, required: true },
  originalTotalPrice: { type: Number },
  totalRefunded: { type: Number, default: 0 },
  paymentMethod: { 
    type: String, 
    enum: ["cash", "card", "mobile"], 
    required: true 
  },
  status: {
    type: String,
    enum: ["completed", "partially_refunded", "fully_refunded"],
    default: "completed"
  },
  refundHistory: [OrderRefundHistorySchema]
}, {
  timestamps: true
});

// Indexes for better performance
OrderSchema.index({ userPhone: 1 });
OrderSchema.index({ date: -1 });
OrderSchema.index({ cashierId: 1 });
OrderSchema.index({ status: 1 });

const Order = mongoose.model("Order", OrderSchema);
module.exports = { Order };