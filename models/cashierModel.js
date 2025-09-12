const mongoose = require('mongoose');

const sessionEntrySchema = new mongoose.Schema({
  checkInTime: {
    type: Date,
    required: true
  },
  checkOutTime: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  checkoutReason: {
    type: String,
    enum: ['manual', 'tab-switch', 'window-minimize', 'browser-close', 'logout', 'system-timeout', 'end-of-shift', 'break', 'emergency', 'system-issue', 'other'],
    default: null
  },
  checkoutReasonDetails: {
    type: String,
    default: null
  },
  sessionDuration: {
    type: Number, // in minutes
    default: 0
  },
  salesDuringSession: {
    type: Number,
    default: 0
  },
  transactionsDuringSession: {
    type: Number,
    default: 0
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
  lastActivityTime: {
    type: Date,
    default: Date.now
  }
}, {
  _id: true
});

const cashierDailySessionSchema = new mongoose.Schema({
  cashierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users',
    required: true
  },
  cashierName: {
    type: String,
    required: true
  },
  sessionDate: {
    type: String,
    required: true,
    default: function() {
      return new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    }
  },
  sessions: [sessionEntrySchema],
  
  // Daily totals and counts
  totalCheckIns: {
    type: Number,
    default: 0
  },
  totalCheckOuts: {
    type: Number,
    default: 0
  },
  totalSessionDuration: {
    type: Number, // in minutes
    default: 0
  },
  totalDailySales: {
    type: Number,
    default: 0
  },
  totalDailyTransactions: {
    type: Number,
    default: 0
  },
  
  // Current session status
  currentlyActive: {
    type: Boolean,
    default: false
  },
  activeSessionIndex: {
    type: Number,
    default: null
  },
  
  // Checkout reasons summary
  checkoutReasonsSummary: {
    manual: { type: Number, default: 0 },
    'tab-switch': { type: Number, default: 0 },
    'window-minimize': { type: Number, default: 0 },
    'browser-close': { type: Number, default: 0 },
    logout: { type: Number, default: 0 },
    'system-timeout': { type: Number, default: 0 },
    'end-of-shift': { type: Number, default: 0 },
    break: { type: Number, default: 0 },
    emergency: { type: Number, default: 0 },
    'system-issue': { type: Number, default: 0 },
    other: { type: Number, default: 0 }
  },
  
  // Auto screen sharing
  autoScreenShareRequested: {
    type: Boolean,
    default: false
  },
  
  // Admin tracking fields (MISSING IN YOUR ORIGINAL MODEL)
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
  
  lastActivityTime: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for unique cashier per day
cashierDailySessionSchema.index({ cashierId: 1, sessionDate: 1 }, { unique: true });
cashierDailySessionSchema.index({ currentlyActive: 1 });
cashierDailySessionSchema.index({ isReadByAdmin: 1 });

// Pre-save middleware to calculate totals
cashierDailySessionSchema.pre('save', function(next) {
  // Recalculate totals
  this.totalCheckIns = this.sessions.length;
  this.totalCheckOuts = this.sessions.filter(session => session.checkOutTime).length;
  this.totalSessionDuration = this.sessions.reduce((total, session) => total + session.sessionDuration, 0);
  this.totalDailySales = this.sessions.reduce((total, session) => total + session.salesDuringSession, 0);
  this.totalDailyTransactions = this.sessions.reduce((total, session) => total + session.transactionsDuringSession, 0);
  
  // Update checkout reasons summary
  this.checkoutReasonsSummary = {
    manual: 0,
    'tab-switch': 0,
    'window-minimize': 0,
    'browser-close': 0,
    logout: 0,
    'system-timeout': 0,
    'end-of-shift': 0,
    break: 0,
    emergency: 0,
    'system-issue': 0,
    other: 0
  };
  
  this.sessions.forEach(session => {
    if (session.checkoutReason && this.checkoutReasonsSummary.hasOwnProperty(session.checkoutReason)) {
      this.checkoutReasonsSummary[session.checkoutReason]++;
    }
  });
  
  next();
});

module.exports = mongoose.model('CashierDailySession', cashierDailySessionSchema);