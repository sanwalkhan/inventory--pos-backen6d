const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    maxlength: 200
  },
  message: {
    type: String,
    required: true,
    maxlength: 1000
  },
  type: {
    type: String,
    required: true,
    enum: [
      'check-in',
      'check-out', 
      'auto-checkout',
      'force-checkout',
      'screen-share-connected',
      'screen-share-disconnected',
      'long-session',
      'session-timeout',
      'emergency',
      'system-alert',
      'high-sales',
      'low-performance',
      'break-time',
      'shift-start',
      'shift-end',
      'system-maintenance',
      'other'
    ],
    default: 'other'
  },
  priority: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  // Related entities
  cashierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users',
    required: true
  },
  cashierName: {
    type: String,
    required: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CashierDailySession',
    default: null
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  recipientRole: {
    type: String,
    enum: ['admin', 'supervisor', 'manager', 'all'],
    default: 'supervisor'
  },
  // Status and metadata
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  readBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users',
    default: null
  },
  // Additional data that might be useful
  metadata: {
    checkInTime: { type: Date, default: null },
    checkOutTime: { type: Date, default: null },
    sessionDuration: { type: Number, default: null }, // in minutes
    salesAmount: { type: Number, default: null },
    transactionCount: { type: Number, default: null },
    reason: { type: String, default: null },
    reasonDetails: { type: String, default: null },
    alertThreshold: { type: Number, default: null },
    currentValue: { type: Number, default: null }
  },
  // Expiry and cleanup
  expiresAt: {
    type: Date,
    default: function() {
      // Auto-expire after 30 days
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Source information
  source: {
    type: String,
    enum: ['system', 'manual', 'auto'],
    default: 'system'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Users',
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better performance
notificationSchema.index({ cashierId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, priority: 1, createdAt: -1 });
notificationSchema.index({ isRead: 1, createdAt: -1 });
notificationSchema.index({ priority: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Virtual for age calculation
notificationSchema.virtual('ageInHours').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60));
});

// Instance method to mark as read
notificationSchema.methods.markAsRead = function(userId) {
  this.isRead = true;
  this.readAt = new Date();
  this.readBy = userId;
  return this.save();
};

// Static method to create notification with real-time emission
notificationSchema.statics.createAndEmit = async function(notificationData, io) {
  try {
    const notification = await this.create(notificationData);
    
    // Get unread count for the recipient
    let unreadCount = 0;
    if (notification.recipientId) {
      unreadCount = await this.countDocuments({
        recipientId: notification.recipientId,
        isRead: false,
        isActive: true
      });
    } else {
      // For notifications to all supervisors/admins
      unreadCount = await this.countDocuments({
        recipientRole: notification.recipientRole,
        recipientId: null,
        isRead: false,
        isActive: true
      });
    }

    // Emit to specific recipient or all users with the role
    if (io) {
      const eventData = {
        notification: notification.toJSON(),
        unreadCount
      };

      if (notification.recipientId) {
        io.to(`user_${notification.recipientId}`).emit('new-notification', eventData);
      } else {
        // Emit to all connected users with the specified role
        io.emit('new-notification', eventData);
      }
    }

    return notification;
  } catch (error) {
    console.error('Error creating and emitting notification:', error);
    throw error;
  }
};

// Static method to get statistics
notificationSchema.statics.getStats = async function(userId = null, role = 'supervisor') {
  try {
    const matchStage = userId 
      ? { recipientId: userId, isActive: true }
      : { recipientRole: role, recipientId: null, isActive: true };

    const stats = await this.aggregate([
      { $match: matchStage },
      {
        $facet: {
          total: [{ $count: "count" }],
          unread: [{ $match: { isRead: false } }, { $count: "count" }],
          today: [
            { 
              $match: { 
                createdAt: { 
                  $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
                } 
              } 
            },
            { $count: "count" }
          ],
          critical: [{ $match: { priority: "critical", isRead: false } }, { $count: "count" }],
          byType: [
            { $group: { _id: "$type", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ],
          byPriority: [
            { $group: { _id: "$priority", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
          ]
        }
      }
    ]);

    return {
      total: stats[0].total[0]?.count || 0,
      unread: stats[0].unread[0]?.count || 0,
      today: stats[0].today[0]?.count || 0,
      critical: stats[0].critical[0]?.count || 0,
      byType: stats[0].byType,
      byPriority: stats[0].byPriority
    };
  } catch (error) {
    console.error('Error getting notification stats:', error);
    return {
      total: 0,
      unread: 0,
      today: 0,
      critical: 0,
      byType: [],
      byPriority: []
    };
  }
};

module.exports = mongoose.model('Notification', notificationSchema);