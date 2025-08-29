const mongoose = require('mongoose');

const cashierSessionSchema = new mongoose.Schema({
  cashierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users',
    required: true
  },
  cashierName: {
    type: String,
    required: true
  },
  checkInTime: {
    type: Date,
    required: true,
    default: Date.now
  },
  checkOutTime: {
    type: Date,
    default: null
  },
  sessionDate: {
    type: String,
    required: true,
    default: function() {
      return new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    }
  },
  totalSales: {
    type: Number,
    default: 0
  },
  totalTransactions: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'completed'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Index for efficient queries
cashierSessionSchema.index({ cashierId: 1, sessionDate: 1 });
cashierSessionSchema.index({ status: 1 });

module.exports = mongoose.model('CashierSession', cashierSessionSchema);