const Notification = require('../models/notificationModel');
const User = require('../models/userModel');
const { getOrganizationId } = require("../middleware/authmiddleware");

// Helper to get organization ID from request
const getRequestOrganizationId = (req) => {
  return req.organizationId || getOrganizationId(req);
};

// Get notifications with pagination and filters with organization isolation
exports.getNotifications = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required"
      });
    }

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

    // Build query with organization isolation
    const query = {
      organizationId: organizationId,
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

    // Get notifications with organization isolation
    const notifications = await Notification.find(query)
      .populate('cashierId', 'username email')
      .populate('readBy', 'username email')
      .populate('createdBy', 'username email')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count with organization isolation
    const total = await Notification.countDocuments(query);

    // Get unread count with organization isolation
    const unreadQuery = { ...query, isRead: false };
    const unreadCount = await Notification.countDocuments(unreadQuery);

    res.json({
      success: true,
      notifications,
      organizationId: organizationId,
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

// Get notification statistics with organization isolation
exports.getNotificationStats = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required"
      });
    }

    const userRole = 'supervisor';
    
    // Get stats with organization isolation
    const totalNotifications = await Notification.countDocuments({
      organizationId: organizationId,
      isActive: true,
      $or: [
        { recipientId: null, recipientRole: userRole }
      ]
    });

    const unreadNotifications = await Notification.countDocuments({
      organizationId: organizationId,
      isActive: true,
      isRead: false,
      $or: [
        { recipientId: null, recipientRole: userRole }
      ]
    });

    const priorityStats = await Notification.aggregate([
      {
        $match: {
          organizationId: organizationId,
          isActive: true,
          $or: [
            { recipientId: null, recipientRole: userRole }
          ]
        }
      },
      {
        $group: {
          _id: '$priority',
          count: { $sum: 1 }
        }
      }
    ]);

    const typeStats = await Notification.aggregate([
      {
        $match: {
          organizationId: organizationId,
          isActive: true,
          $or: [
            { recipientId: null, recipientRole: userRole }
          ]
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayNotifications = await Notification.countDocuments({
      organizationId: organizationId,
      isActive: true,
      createdAt: { $gte: today },
      $or: [
        { recipientId: null, recipientRole: userRole }
      ]
    });

    const stats = {
      total: totalNotifications,
      unread: unreadNotifications,
      today: todayNotifications,
      byPriority: priorityStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      byType: typeStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    };

    res.json({
      success: true,
      stats,
      organizationId: organizationId,
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

// Mark single notification as read with organization isolation
exports.markNotificationAsRead = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required"
      });
    }

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

    // Find notification with organization isolation
    const notification = await Notification.findOne({
      _id: id,
      organizationId: organizationId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found in your organization'
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
      notification.isRead = true;
      notification.readAt = new Date();
      notification.readBy = userId;
      await notification.save();
    }

    // Get updated unread count with organization isolation
    const unreadCount = await Notification.countDocuments({
      organizationId: organizationId,
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
        unreadCount,
        organizationId: organizationId
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
      organizationId: organizationId,
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

// Mark all notifications as read with organization isolation
exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required"
      });
    }

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

    // Update all unread notifications for this user with organization isolation
    const updateQuery = {
      organizationId: organizationId,
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
        updatedCount: updateResult.modifiedCount,
        organizationId: organizationId
      });
    }

    res.json({
      success: true,
      updatedCount: updateResult.modifiedCount,
      unreadCount: 0, // All are now read
      organizationId: organizationId,
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

// Delete a notification with organization isolation
exports.deleteNotification = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required"
      });
    }

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

    // ✅ Find the notification first with organization isolation
    const notification = await Notification.findOne({
      _id: id,
      organizationId: organizationId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found in your organization",
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

    // ✅ Recalculate unread count with organization isolation (only active docs left)
    const unreadCount = await Notification.countDocuments({
      organizationId: organizationId,
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
        organizationId: organizationId
      });
    }

    res.json({
      success: true,
      unreadCount,
      organizationId: organizationId,
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

// Clear all notifications (mark all as inactive) with organization isolation
exports.clearAllNotifications = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required"
      });
    }

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

    // Mark all notifications as inactive for this user with organization isolation
    const updateQuery = {
      organizationId: organizationId,
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
        clearedCount: updateResult.modifiedCount,
        organizationId: organizationId
      });
    }

    res.json({
      success: true,
      clearedCount: updateResult.modifiedCount,
      unreadCount: 0, // All are now deleted
      organizationId: organizationId,
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

// Create a new notification (for manual notifications) with organization isolation
exports.createNotification = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required"
      });
    }

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

    // Verify cashier belongs to the same organization
    const cashier = await User.findOne({
      _id: cashierId,
      organizationId: organizationId
    });

    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found in your organization'
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
      createdBy: req.body.createdBy || null,
      organizationId: organizationId
    };

    // Create notification
    const notification = new Notification(notificationData);
    await notification.save();

    // Populate for response
    await notification.populate('cashierId', 'username email');
    await notification.populate('createdBy', 'username email');

    // Emit socket event if available
    if (req.io) {
      req.io.to(`org_${organizationId}`).emit('new-notification', {
        notification: notification.toObject(),
        organizationId: organizationId
      });
    }

    res.status(201).json({
      success: true,
      notification,
      organizationId: organizationId,
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

// Get notification by ID with organization isolation
exports.getNotificationById = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required"
      });
    }

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

    // Find notification with organization isolation
    const notification = await Notification.findOne({
      _id: id,
      organizationId: organizationId
    })
      .populate('cashierId', 'username email')
      .populate('readBy', 'username email')
      .populate('createdBy', 'username email')
      .lean();

    if (!notification || !notification.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found in your organization'
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
      organizationId: organizationId,
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

// Helper function to create cashier-related notifications with organization isolation
exports.createCashierNotification = async (type, cashierData, sessionData, io, organizationId) => {
  try {
    if (!organizationId) {
      throw new Error('Organization ID is required for creating notifications');
    }

    // Verify cashier belongs to the same organization
    const cashier = await User.findOne({
      _id: cashierData.cashierId || cashierData._id,
      organizationId: organizationId
    });

    if (!cashier) {
      throw new Error('Cashier not found in organization');
    }

    let notificationData = {
      cashierId: cashierData.cashierId || cashierData._id,
      cashierName: cashierData.cashierName || cashierData.username,
      sessionId: sessionData?._id || null,
      type,
      recipientRole: 'supervisor',
      source: 'system',
      organizationId: organizationId
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
            checkInTime: sessionData.checkInTime || new Date(),
            organizationId: organizationId
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
            transactionCount: sessionData.transactionsDuringSession,
            organizationId: organizationId
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
            sessionDuration: sessionData.sessionDuration,
            organizationId: organizationId
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
            reason: 'force-checkout',
            organizationId: organizationId
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
            disconnectedAt: new Date(),
            organizationId: organizationId
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
            alertThreshold: 480, // 8 hours
            organizationId: organizationId
          }
        };
        break;

      default:
        notificationData = {
          ...notificationData,
          title: `System notification`,
          message: `Notification for ${cashierData.cashierName}`,
          priority: 'low',
          metadata: {
            organizationId: organizationId
          }
        };
    }

    const notification = new Notification(notificationData);
    await notification.save();

    // Emit socket event
    if (io) {
      io.to(`org_${organizationId}`).emit('new-notification', {
        notification: notification.toObject(),
        organizationId: organizationId
      });
    }

    return notification;

  } catch (error) {
    console.error('Error creating cashier notification:', error);
    throw error;
  }
};

// Get notifications by cashier ID with organization isolation
exports.getCashierNotifications = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req);
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required"
      });
    }

    const { cashierId } = req.params;
    const {
      page = 1,
      limit = 20,
      type,
      isRead,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Validate cashier belongs to organization
    const cashier = await User.findOne({
      _id: cashierId,
      organizationId: organizationId
    });

    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found in your organization'
      });
    }

    // Build query with organization isolation
    const query = {
      organizationId: organizationId,
      cashierId: cashierId,
      isActive: true
    };

    if (type && type !== 'all') {
      query.type = type;
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

    const total = await Notification.countDocuments(query);

    res.json({
      success: true,
      notifications,
      organizationId: organizationId,
      cashierInfo: {
        cashierId: cashier._id,
        cashierName: cashier.username,
        email: cashier.email
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        totalNotifications: total,
        hasNextPage: skip + parseInt(limit) < total,
        hasPrevPage: parseInt(page) > 1
      },
      message: `Retrieved ${notifications.length} notifications for cashier`
    });

  } catch (error) {
    console.error('Get cashier notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cashier notifications',
      error: error.message
    });
  }
};