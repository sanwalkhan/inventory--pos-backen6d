const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

// Middleware to attach socket.io to request object
const attachSocket = (req, res, next) => {
  // Socket.io instance should be attached to the app during server setup
  req.io = req.app.locals.io;
  next();
};

// Apply socket middleware to all routes
router.use(attachSocket);

// Get all notifications with filters and pagination
// GET /api/notifications?page=1&limit=20&type=all&priority=all&isRead=all&userId=123
router.get('/notifications', notificationController.getNotifications);

// Get notification statistics
// GET /api/notifications/stats?userId=123&userRole=supervisor
router.get('/notifications/stats', notificationController.getNotificationStats);

// Get specific notification by ID
// GET /api/notifications/:id?userId=123
router.get('/notifications/:id', notificationController.getNotificationById);

// Mark specific notification as read
// PATCH /api/notifications/:id/read
// Body: { userId: "123" }
router.patch('/notifications/:id/read', notificationController.markNotificationAsRead);

// Mark all notifications as read for a user
// PATCH /api/notifications/read-all
// Body: { userId: "123" }
router.patch('/notifications/read-all', notificationController.markAllNotificationsAsRead);

// Delete (soft delete) a specific notification
// DELETE /api/notifications/:id
// Body: { userId: "123" } or Header: x-user-id
router.delete('/notifications/:id', notificationController.deleteNotification);

// Clear all notifications for a user (mark all as inactive)
// DELETE /api/notifications/clear-all
// Body: { userId: "123" }
router.delete('/notifications/clear-all', notificationController.clearAllNotifications);

// Create a new notification manually
// POST /api/notifications
// Body: { title, message, type?, priority?, cashierId, cashierName, recipientId?, recipientRole?, metadata? }
router.post('/notifications', notificationController.createNotification);

module.exports = router;