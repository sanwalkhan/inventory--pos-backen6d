const Notification = require('../models/notificationModel');
const User = require('../models/userModel');

// Get notifications with pagination and filters
exports.getNotifications = async (req, res) => {
  try {
    
    const userId = req.query.userId || req.body.userId || req.headers['x-user-id'];
    const userRole = 'supervisor';
    
    const {
      page = 1,
      limit = 20,
      type,
      priority,
      isRead,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build query
    const query = {
      isActive: true,
      $or: [
        { recipientId: userId },
        { recipientRole: userRole, recipientId: null }
      ]
    };

    if (type && type !== 'all') {
      query.type = type;
    }

    if (priority && priority !== 'all') {
      query.priority = priority;
    }

    if (isRead && isRead !== 'all') {
      query.isRead = isRead === 'true';
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Get notifications
    const notifications = await Notification.find(query)
      .populate('cashierId', 'username email')
      .populate('readBy', 'username email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count
    const total = await Notification.countDocuments(query);

    // Get unread count
    const unreadQuery = { ...query, isRead: false };
    const unreadCount = await Notification.countDocuments(unreadQuery);

    res.json({
      success: true,
      notifications,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalNotifications: total,
        hasNextPage: skip + parseInt(limit) < total,
        hasPrevPage: parseInt(page) > 1
      },
      unreadCount,
      message: `Retrieved ${notifications.length} notifications`
    });

  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve notifications',
      error: error.message
    });
  }
};

// Get notification statistics
exports.getNotificationStats = async (req, res) => {
  try {
    const userRole = 'supervisor';
    const stats = await Notification.getStats(null, userRole);

    res.json({
      success: true,
      stats,
      message: 'Notification statistics retrieved successfully'
    });

  } catch (error) {
    console.error('Get notification stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve notification statistics',
      error: error.message
    });
  }
};

// Mark single notification as read - FIXED
exports.markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get userId from multiple sources with proper validation
    const userId = req.body.userId || req.query.userId || req.headers['x-user-id'];
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if notification is already inactive (deleted)
    if (!notification.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found or has been deleted'
      });
    }

    // Check if user has permission to read this notification
    const canRead = (
      (notification.recipientId && notification.recipientId.toString() === userId) ||
      (notification.recipientId === null && notification.recipientRole === 'supervisor')
    );

    if (!canRead) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }

    // Only update if not already read
    if (!notification.isRead) {
      // Use the instance method from the model
      await notification.markAsRead(userId);
      
      // Alternative direct update method:
      /*
      notification.isRead = true;
      notification.readAt = new Date();
      notification.readBy = userId;
      await notification.save();
      */
    }

    // Get updated unread count
    const unreadCount = await Notification.countDocuments({
      $or: [
        { recipientId: userId },
        { recipientRole: 'supervisor', recipientId: null }
      ],
      isRead: false,
      isActive: true
    });

    // Emit update via socket if available
    if (req.io) {
      req.io.to(`user_${userId}`).emit('notification-read', {
        notificationId: id,
        unreadCount
      });
    }

    res.json({
      success: true,
      notification: {
        _id: notification._id,
        isRead: notification.isRead,
        readAt: notification.readAt,
        readBy: notification.readBy
      },
      unreadCount,
      message: 'Notification marked as read successfully'
    });

  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read',
      error: error.message
    });
  }
};

// Mark all notifications as read - FIXED
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Update all unread notifications for this user
    const updateQuery = {
      $or: [
        { recipientId: userId },
        { recipientRole: 'supervisor', recipientId: null }
      ],
      isRead: false,
      isActive: true
    };

    const updateResult = await Notification.updateMany(updateQuery, {
      $set: {
        isRead: true,
        readAt: new Date(),
        readBy: userId
      }
    });

    // Emit update via socket if available
    if (req.io) {
      req.io.to(`user_${userId}`).emit('all-notifications-read', {
        userId,
        updatedCount: updateResult.modifiedCount
      });
    }

    res.json({
      success: true,
      updatedCount: updateResult.modifiedCount,
      unreadCount: 0, // All are now read
      message: `Marked ${updateResult.modifiedCount} notifications as read`
    });

  } catch (error) {
    console.error('Mark all notifications as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark all notifications as read',
      error: error.message
    });
  }
};

// Delete a notification - FIXED
exports.deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId =
      (req.body && req.body.userId) ||
      req.query.userId ||
      req.headers["x-user-id"];

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const mongoose = require("mongoose");
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID format",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    // ✅ Find the notification first
    const notification = await Notification.findById(id);
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    // ✅ Permission check
    const canDelete =
      (notification.recipientId &&
        notification.recipientId.toString() === userId) ||
      (notification.recipientId === null &&
        notification.recipientRole === "supervisor");

    if (!canDelete) {
      return res.status(403).json({
        success: false,
        message: "Permission denied",
      });
    }

    // ✅ Store unread state before deleting
    const wasUnread = !notification.isRead;

    // ✅ Permanently delete
    await Notification.findByIdAndDelete(id);

    // ✅ Recalculate unread count (only active docs left)
    const unreadCount = await Notification.countDocuments({
      $or: [
        { recipientId: userId },
        { recipientRole: "supervisor", recipientId: null },
      ],
      isRead: false,
    });

    // ✅ Emit socket event if needed
    if (req.io) {
      req.io.to(`user_${userId}`).emit("notification-deleted", {
        notificationId: id,
        unreadCount,
        wasUnread,
      });
    }

    res.json({
      success: true,
      unreadCount,
      message: "Notification permanently deleted",
    });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      error: error.message,
    });
  }
};


// Clear all notifications (mark all as inactive) - FIXED
exports.clearAllNotifications = async (req, res) => {
  try {
    const userId = req.body.userId || req.query.userId || req.headers['x-user-id'];

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Mark all notifications as inactive for this user
    const updateQuery = {
      $or: [
        { recipientId: userId },
        { recipientRole: 'supervisor', recipientId: null }
      ],
      isActive: true
    };

    const updateResult = await Notification.updateMany(updateQuery, {
      $set: {
        isActive: false,
        deletedAt: new Date(),
        deletedBy: userId
      }
    });

    // Emit update via socket if available
    if (req.io) {
      req.io.to(`user_${userId}`).emit('all-notifications-cleared', {
        userId,
        clearedCount: updateResult.modifiedCount
      });
    }

    res.json({
      success: true,
      clearedCount: updateResult.modifiedCount,
      unreadCount: 0, // All are now deleted
      message: `Cleared ${updateResult.modifiedCount} notifications`
    });

  } catch (error) {
    console.error('Clear all notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear all notifications',
      error: error.message
    });
  }
};

// Create a new notification (for manual notifications)
exports.createNotification = async (req, res) => {
  try {
    const {
      title,
      message,
      type = 'other',
      priority = 'medium',
      cashierId,
      cashierName,
      recipientId = null,
      recipientRole = 'supervisor',
      metadata = {}
    } = req.body;

    if (!title || !message || !cashierId || !cashierName) {
      return res.status(400).json({
        success: false,
        message: 'Title, message, cashier ID and cashier name are required'
      });
    }

    const notificationData = {
      title,
      message,
      type,
      priority,
      cashierId,
      cashierName,
      recipientId,
      recipientRole,
      metadata,
      source: 'manual',
      createdBy: req.body.createdBy || null
    };

    const notification = await Notification.createAndEmit(notificationData, req.io);

    res.status(201).json({
      success: true,
      notification,
      message: 'Notification created successfully'
    });

  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create notification',
      error: error.message
    });
  }
};

// Get notification by ID
exports.getNotificationById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId || req.body.userId || req.headers['x-user-id'];

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid notification ID format'
      });
    }

    const notification = await Notification.findById(id)
      .populate('cashierId', 'username email')
      .populate('readBy', 'username email')
      .lean();

    if (!notification || !notification.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if user has permission to view this notification
    const canView = (
      (notification.recipientId && notification.recipientId.toString() === userId) ||
      (notification.recipientId === null && notification.recipientRole === 'supervisor')
    );

    if (!canView) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }

    res.json({
      success: true,
      notification,
      message: 'Notification retrieved successfully'
    });

  } catch (error) {
    console.error('Get notification by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve notification',
      error: error.message
    });
  }
};

// Helper function to create cashier-related notifications
exports.createCashierNotification = async (type, cashierData, sessionData, io) => {
  try {
    let notificationData = {
      cashierId: cashierData.cashierId || cashierData._id,
      cashierName: cashierData.cashierName || cashierData.username,
      sessionId: sessionData?._id || null,
      type,
      recipientRole: 'supervisor',
      source: 'system'
    };

    // Customize notification based on type
    switch (type) {
      case 'check-in':
        notificationData = {
          ...notificationData,
          title: `${cashierData.cashierName} checked in`,
          message: `${cashierData.cashierName} has started a new session`,
          priority: 'low',
          metadata: {
            checkInTime: sessionData.checkInTime || new Date()
          }
        };
        break;

      case 'check-out':
        notificationData = {
          ...notificationData,
          title: `${cashierData.cashierName} checked out`,
          message: `${cashierData.cashierName} has ended their session`,
          priority: 'low',
          metadata: {
            checkInTime: sessionData.checkInTime,
            checkOutTime: sessionData.checkOutTime || new Date(),
            sessionDuration: sessionData.sessionDuration,
            salesAmount: sessionData.salesDuringSession,
            transactionCount: sessionData.transactionsDuringSession
          }
        };
        break;

      case 'auto-checkout':
        notificationData = {
          ...notificationData,
          title: `${cashierData.cashierName} auto-checked out`,
          message: `${cashierData.cashierName} was automatically checked out due to: ${sessionData.reason || 'unknown reason'}`,
          priority: 'medium',
          metadata: {
            checkInTime: sessionData.checkInTime,
            checkOutTime: sessionData.checkOutTime || new Date(),
            reason: sessionData.reason,
            reasonDetails: sessionData.reasonDetails,
            sessionDuration: sessionData.sessionDuration
          }
        };
        break;

      case 'force-checkout':
        notificationData = {
          ...notificationData,
          title: `${cashierData.cashierName} force checked out`,
          message: `${cashierData.cashierName} was force checked out by supervisor`,
          priority: 'high',
          metadata: {
            checkInTime: sessionData.checkInTime,
            checkOutTime: new Date(),
            reason: 'force-checkout'
          }
        };
        break;

      case 'screen-share-disconnected':
        notificationData = {
          ...notificationData,
          title: `Screen sharing disconnected`,
          message: `${cashierData.cashierName}'s screen sharing has been disconnected`,
          priority: 'high',
          metadata: {
            disconnectedAt: new Date()
          }
        };
        break;

      case 'long-session':
        notificationData = {
          ...notificationData,
          title: `Long session alert`,
          message: `${cashierData.cashierName} has been active for over ${sessionData.sessionDuration} minutes`,
          priority: 'medium',
          metadata: {
            checkInTime: sessionData.checkInTime,
            sessionDuration: sessionData.sessionDuration,
            alertThreshold: 480 // 8 hours
          }
        };
        break;

      default:
        notificationData = {
          ...notificationData,
          title: `System notification`,
          message: `Notification for ${cashierData.cashierName}`,
          priority: 'low'
        };
    }

    const notification = await Notification.createAndEmit(notificationData, io);
    return notification;

  } catch (error) {
    console.error('Error creating cashier notification:', error);
    throw error;
  }
};