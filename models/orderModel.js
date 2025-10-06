const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Products",
    required: true,
  },
  name: { type: String, required: true },
  barcode: { type: String, required: true },
  hsCode: {
    type: String,
    required: true,
    match: [/^\d{4}\.\d{4}$/, 'HS Code must be in format XXXX.XXXX (8 digits total)']
  },

  // Pricing information
  costPrice: { type: Number, required: true }, // Original cost price
  sellingPrice: { type: Number, required: true }, // Final selling price (after all calculations)
  sellingPriceWithoutDiscount: { type: Number, required: true }, // Price before discount

  // Tax rates (percentages)
  salesTax: { type: Number, default: 0, min: 0, max: 100 },
  customDuty: { type: Number, default: 0, min: 0, max: 100 },
  withholdingTax: { type: Number, default: 0, min: 0, max: 100 },

  // Margin and discount (percentages)
  marginPercent: { type: Number, default: 0, min: 0, max: 100 },
  discount: { type: Number, default: 0, min: 0, max: 100 },

  // Calculated amounts (for reporting)
  salesTaxAmount: { type: Number, default: 0 },
  customDutyAmount: { type: Number, default: 0 },
  withholdingTaxAmount: { type: Number, default: 0 },
  marginAmount: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },

  // Quantity
  quantity: { type: Number, required: true },

  // Total calculations
  subtotal: { type: Number, required: true }, // quantity * sellingPrice

  // For tracking refunds
  originalQuantity: { type: Number },
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
    totalRefundAmount: { type: Number, required: true },
    hsCode: {
      type: String,
      required: true,
      match: [/^\d{4}\.\d{4}$/, 'HS Code must be in format XXXX.XXXX (8 digits total)']
    }
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

  // Totals
  totalPrice: { type: Number, required: true }, // Final total after all calculations
  originalTotalPrice: { type: Number }, // For refund tracking
  totalRefunded: { type: Number, default: 0 },

  // Aggregate tax and pricing info
  totalSalesTax: { type: Number, default: 0 },
  totalCustomDuty: { type: Number, default: 0 },
  totalWithholdingTax: { type: Number, default: 0 },
  totalMargin: { type: Number, default: 0 },
  totalDiscount: { type: Number, default: 0 },
  totalCostPrice: { type: Number, default: 0 },

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
OrderSchema.index({ 'items.hsCode': 1 }); // Index for HS code queries

const Order = mongoose.model("Order", OrderSchema);
module.exports = { Order };
