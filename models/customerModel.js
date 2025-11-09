const mongoose = require("mongoose");

const purchaseItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Products" },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, required: true },
  originalQuantity: { type: Number }, // For tracking refunds
});

const orderSchema = new mongoose.Schema({
  orderDate: { type: Date, default: Date.now },
  items: [purchaseItemSchema],
  cashierId: { type: String }, // Added cashier ID
  cashierName: { type: String }, // Added cashier name
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: function () {
      return true;
    },
  },
  paymentMethod: { 
    type: String, 
    enum: ["cash", "card", "mobile" ,"split"],
    default: "cash" 
  }, // Added payment method
  totalAmount: { type: Number, required: true }, // Added total amount
});

// Refund History Schema for Customers
const customerRefundHistorySchema = new mongoose.Schema({
  refundDate: { type: Date, required: true },
  refundedBy: { type: String, required: true },
  refundedByName: { type: String, required: true },
  orderDate: { type: Date, required: true }, // Original order date
  cashierName: { type: String }, // Cashier who processed original order
  items: [{
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Products", required: true },
    name: { type: String, required: true },
    originalQuantity: { type: Number, required: true },
    refundedQuantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    totalRefundAmount: { type: Number, required: true }
  }],
  totalRefundAmount: { type: Number, required: true },
  originalOrderTotal: { type: Number, required: true },
  reason: { type: String, default: "Customer request" }
});

const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    phone: { type: String, required: true},
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: function () {
        return true;
      },
    },
    purchaseHistory: [orderSchema], // Array of orders, each with date and items
    purchaseCount: { type: Number, required: true, default: 0 },
    totalSpent: { type: Number, default: 0 }, // Added total spent
    lastPurchaseDate: { type: Date }, // Added last purchase date
    refundHistory: [customerRefundHistorySchema], // Added refund history
  },
  { timestamps: true }
);

// Indexes for better performance
// In customerModel.js
customerSchema.index({ phone: 1, organizationId: 1 }, { unique: true });
customerSchema.index({ createdAt: -1 });
customerSchema.index({ lastPurchaseDate: -1 });

const Customer = mongoose.model("Customer", customerSchema);

module.exports = { Customer };