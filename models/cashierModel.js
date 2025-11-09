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

  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true
  },
  peerId: {
    type: String,
    default: null
  },

  lastActivityTime: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const cashierDailySessionSchema = new mongoose.Schema({
  cashierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Organization",
    required: true,
    index: true
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
  

  
  // Admin tracking fields
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
    ref: 'User',
    default: null
  },
  
  lastActivityTime: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes for better query performance with organization isolation
cashierDailySessionSchema.index({ organizationId: 1, cashierId: 1, sessionDate: 1 }, { unique: true });
cashierDailySessionSchema.index({ organizationId: 1, currentlyActive: 1 });
cashierDailySessionSchema.index({ organizationId: 1, isReadByAdmin: 1 });
cashierDailySessionSchema.index({ organizationId: 1, sessionDate: 1 });
cashierDailySessionSchema.index({ organizationId: 1, cashierId: 1 });

// Pre-save middleware to calculate totals
cashierDailySessionSchema.pre('save', function(next) {
  // Recalculate totals
  this.totalCheckIns = this.sessions.length;
  this.totalCheckOuts = this.sessions.filter(session => session.checkOutTime).length;
  this.totalSessionDuration = this.sessions.reduce((total, session) => total + (session.sessionDuration || 0), 0);
  this.totalDailySales = this.sessions.reduce((total, session) => total + (session.salesDuringSession || 0), 0);
  this.totalDailyTransactions = this.sessions.reduce((total, session) => total + (session.transactionsDuringSession || 0), 0);
  
  // Update checkout reasons summary
  const reasonsSummary = {
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
    if (session.checkoutReason && reasonsSummary.hasOwnProperty(session.checkoutReason)) {
      reasonsSummary[session.checkoutReason]++;
    }
  });
  
  this.checkoutReasonsSummary = reasonsSummary;
  
  // Update currentlyActive status
  this.currentlyActive = this.sessions.some(session => session.isActive);
  
  // Find active session index
  const activeIndex = this.sessions.findIndex(session => session.isActive);
  this.activeSessionIndex = activeIndex !== -1 ? activeIndex : null;
  
  // Update last activity time
  const lastActivity = this.sessions.reduce((latest, session) => {
    return session.lastActivityTime > latest ? session.lastActivityTime : latest;
  }, new Date(0));
  
  if (lastActivity > new Date(0)) {
    this.lastActivityTime = lastActivity;
  }
  
  next();
});

// Instance method to add a new session
cashierDailySessionSchema.methods.addSession = function(checkInTime) {
  const newSession = {
    checkInTime: checkInTime || new Date(),
    isActive: true,
    lastActivityTime: new Date(),
    organizationId: this.organizationId
  };
  
  this.sessions.push(newSession);
  this.currentlyActive = true;
  this.activeSessionIndex = this.sessions.length - 1;
  this.totalCheckIns = this.sessions.length;
};

// Instance method to checkout active session
cashierDailySessionSchema.methods.checkoutSession = function(checkOutTime, reason, reasonDetails) {
  if (this.activeSessionIndex === null || !this.sessions[this.activeSessionIndex]) {
    throw new Error('No active session to checkout');
  }
  
  const activeSession = this.sessions[this.activeSessionIndex];
  const checkoutTime = checkOutTime || new Date();
  
  activeSession.checkOutTime = checkoutTime;
  activeSession.isActive = false;
  activeSession.checkoutReason = reason || 'manual';
  activeSession.checkoutReasonDetails = reasonDetails;
  activeSession.sessionDuration = Math.round((checkoutTime - activeSession.checkInTime) / (1000 * 60));
  
  this.currentlyActive = false;
  this.activeSessionIndex = null;
  this.totalCheckOuts = this.sessions.filter(session => session.checkOutTime).length;
};

// Static method to find active session by cashier ID and organization
cashierDailySessionSchema.statics.findActiveSession = function(cashierId, organizationId) {
  return this.findOne({
    cashierId: cashierId,
    organizationId: organizationId,
    currentlyActive: true
  });
};

// Static method to find today's session by cashier ID and organization
cashierDailySessionSchema.statics.findTodaySession = function(cashierId, organizationId) {
  const today = new Date().toISOString().split('T')[0];
  return this.findOne({
    cashierId: cashierId,
    organizationId: organizationId,
    sessionDate: today
  });
};

// Static method to get organization sessions
cashierDailySessionSchema.statics.getOrganizationSessions = function(organizationId, query = {}) {
  return this.find({
    organizationId: organizationId,
    ...query
  }).populate('cashierId', 'username email').sort({ sessionDate: -1, createdAt: -1 });
};

module.exports = mongoose.model('CashierDailySession', cashierDailySessionSchema);