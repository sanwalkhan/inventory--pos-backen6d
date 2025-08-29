const mongoose = require('mongoose');

const OrderItemSchema = new mongoose.Schema({
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Products',
    required: true 
  },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true },
  unitPrice: { type: Number, required: true },
  totalPrice: { type: Number, required: true },
  receivedQuantity: { type: Number, default: 0 },
  isFullyReceived: { type: Boolean, default: false }
}, { _id: true });

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  items: [OrderItemSchema],
  totalAmount: { type: Number, required: true },
  paidAmount: { type: Number, default: 0 },
  dueAmount: { type: Number, default: 0 },
  orderDate: { type: Date, default: Date.now },
  isFullyReceived: { type: Boolean, default: false },
  receivedDate: { type: Date },
  status: { 
    type: String, 
    enum: ['pending', 'partially_received', 'fully_received'], 
    default: 'pending' 
  },
  notes: { type: String }
}, { _id: true });

const SupplierSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true,
    trim: true 
  },
  email: { 
    type: String, 
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  mobile: { 
    type: String, 
    required: true,
    trim: true,
    unique: true,
   
  },
  address: { type: String, trim: true },
  orders: [OrderSchema],
  totalDues: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  totalPurchased: { type: Number, default: 0 },
  lastOrderDate: { type: Date },
  isActive: { type: Boolean, default: true }
}, { 
  timestamps: true 
});

// Calculate supplier stats before saving
SupplierSchema.pre('save', function(next) {
  this.totalOrders = this.orders.length;
  this.totalDues = this.orders.reduce((sum, order) => sum + order.dueAmount, 0);
  this.totalPurchased = this.orders.reduce((sum, order) => sum + order.totalAmount, 0);
  
  if (this.orders.length > 0) {
    this.lastOrderDate = Math.max(...this.orders.map(order => order.orderDate));
  }
  
  next();
});

module.exports = mongoose.model('Supplier', SupplierSchema);