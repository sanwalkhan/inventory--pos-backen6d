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
    enum: ['active', 'completed', 'auto-checkout'],
    default: 'active'
  },
  checkoutReason: {
    type: String,
    enum: ['manual', 'tab-switch', 'window-minimize', 'browser-close', 'logout', 'system-timeout' , 'other'],
    default: null
  },
  checkoutReasonDetails: {
    type: String,
    default: null
  },
  isReadByAdmin: {
    type: Boolean,
    default: false
  },
  adminReadAt: {
    type: Date,
    default: null
  },
  adminReadBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users',
    default: null
  },
  screenShareEnabled: {
    type: Boolean,
    default: false
  },
  peerId: {
    type: String,
    default: null
  },
  lastScreenShareUpdate: {
    type: Date,
    default: null
  },
  autoScreenShareRequested: {
    type: Boolean,
    default: false
  },
  sessionDuration: {
    type: Number, // in minutes
    default: 0
  },
  lastActivityTime: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
cashierSessionSchema.index({ cashierId: 1, sessionDate: 1 });
cashierSessionSchema.index({ status: 1 });
cashierSessionSchema.index({ isReadByAdmin: 1 });
cashierSessionSchema.index({ checkoutReason: 1 });

// Calculate session duration before saving
cashierSessionSchema.pre('save', function(next) {
  if (this.checkOutTime && this.checkInTime) {
    this.sessionDuration = Math.round((this.checkOutTime - this.checkInTime) / (1000 * 60)); // in minutes
  }
  next();
});

module.exports = mongoose.model('CashierSession', cashierSessionSchema);