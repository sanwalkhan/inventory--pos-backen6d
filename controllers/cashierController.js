const CashierSession = require('../models/cashierModel');
const { Order } = require('../models/orderModel');
const User = require('../models/userModel');

// Enhanced check in with screen sharing preparation
exports.checkIn = async (req, res) => {
  try {
    const { cashierId } = req.body;

    if (!cashierId) {
      return res.status(400).json({
        success: false,
        message: 'Cashier ID is required'
      });
    }

    // Get cashier details
    const cashier = await User.findById(cashierId).select('username email');
    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: 'Cashier not found'
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Check if cashier already has an active session today
    const existingSession = await CashierSession.findOne({
      cashierId,
      sessionDate: today,
      status: 'active'
    });

    if (existingSession) {
      // Update last activity time
      existingSession.lastActivityTime = new Date();
      await existingSession.save();

      return res.status(200).json({
        success: true,
        message: 'Already checked in',
        session: existingSession,
        screenShareEnabled: true
      });
    }

    // Create new session with screen sharing flag
    const newSession = new CashierSession({
      cashierId,
      cashierName: cashier.username,
      checkInTime: new Date(),
      sessionDate: today,
      screenShareEnabled: true,
      autoScreenShareRequested: true,
      lastActivityTime: new Date()
    });

    await newSession.save();

    // Emit check-in event via socket
    if (req.io) {
      req.io.emit('cashier-checked-in', {
        cashierId,
        sessionData: newSession,
        cashierName: cashier.username
      });
    }

    res.status(201).json({
      success: true,
      message: 'Checked in successfully. Screen sharing will start automatically.',
      session: newSession,
      screenShareEnabled: true
    });

  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during check-in',
      error: error.message
    });
  }
};

// Enhanced check out with screen sharing cleanup and reason tracking
exports.checkOut = async (req, res) => {
  try {
    const { cashierId, reason, reasonDetails } = req.body;

    if (!cashierId) {
      return res.status(400).json({
        success: false,
        message: 'Cashier ID is required'
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Find active session for today
    const activeSession = await CashierSession.findOne({
      cashierId,
      sessionDate: today,
      status: 'active'
    });

    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message: 'No active session found for today'
      });
    }

    // Calculate session statistics
    const sessionStats = await Order.aggregate([
      {
        $match: {
          cashierId: cashierId,
          date: {
            $gte: activeSession.checkInTime,
            $lte: new Date()
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalPrice' },
          totalTransactions: { $sum: 1 }
        }
      }
    ]);

    const stats = sessionStats[0] || { totalSales: 0, totalTransactions: 0 };

    // Update session with checkout time and stats
    const checkoutTime = new Date();
    activeSession.checkOutTime = checkoutTime;
    activeSession.status = reason === 'manual' ? 'completed' : 'auto-checkout';
    activeSession.totalSales = stats.totalSales;
    activeSession.totalTransactions = stats.totalTransactions;
    activeSession.screenShareEnabled = false;
    activeSession.checkoutReason = reason || 'manual';
    activeSession.checkoutReasonDetails = reasonDetails || null;
    activeSession.sessionDuration = Math.round((checkoutTime - activeSession.checkInTime) / (1000 * 60));

    await activeSession.save();

    // Emit check-out event via socket
    if (req.io) {
      req.io.emit('cashier-checked-out', {
        cashierId,
        sessionData: activeSession,
        reason: activeSession.checkoutReason,
        reasonDetails: activeSession.checkoutReasonDetails
      });
    }

    res.status(200).json({
      success: true,
      message: `Checked out successfully. Reason: ${reason || 'manual'}`,
      session: activeSession,
      finalStats: stats
    });

  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during check-out',
      error: error.message
    });
  }
};

// Auto checkout for tab switching, minimizing, etc.
exports.autoCheckOut = async (req, res) => {
  try {
    const { cashierId, reason, reasonDetails } = req.body;

    if (!cashierId) {
      return res.status(400).json({
        success: false,
        message: 'Cashier ID is required'
      });
    }

    const today = new Date().toISOString().split('T')[0];

    // Find active session for today
    const activeSession = await CashierSession.findOne({
      cashierId,
      sessionDate: today,
      status: 'active'
    });

    if (!activeSession) {
      return res.status(404).json({
        success: false,
        message: 'No active session found for today'
      });
    }

    // Calculate session statistics
    const sessionStats = await Order.aggregate([
      {
        $match: {
          cashierId: cashierId,
          date: {
            $gte: activeSession.checkInTime,
            $lte: new Date()
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalPrice' },
          totalTransactions: { $sum: 1 }
        }
      }
    ]);

    const stats = sessionStats[0] || { totalSales: 0, totalTransactions: 0 };

    // Update session with auto-checkout
    const checkoutTime = new Date();
    activeSession.checkOutTime = checkoutTime;
    activeSession.status = 'auto-checkout';
    activeSession.totalSales = stats.totalSales;
    activeSession.totalTransactions = stats.totalTransactions;
    activeSession.screenShareEnabled = false;
    activeSession.checkoutReason = reason;
    activeSession.checkoutReasonDetails = reasonDetails;
    activeSession.sessionDuration = Math.round((checkoutTime - activeSession.checkInTime) / (1000 * 60));

    await activeSession.save();

    // Emit auto-checkout event via socket
    if (req.io) {
      req.io.emit('cashier-auto-checked-out', {
        cashierId,
        sessionData: activeSession,
        reason: activeSession.checkoutReason,
        reasonDetails: activeSession.checkoutReasonDetails
      });
    }

    res.status(200).json({
      success: true,
      message: `Auto checked out. Reason: ${reason}`,
      session: activeSession,
      finalStats: stats
    });

  } catch (error) {
    console.error('Auto check-out error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during auto check-out',
      error: error.message
    });
  }
};

// Get enhanced session status
exports.getSessionStatus = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const activeSession = await CashierSession.findOne({
      cashierId,
      sessionDate: today,
      status: 'active'
    });

    // Get today's performance if session is active
    let todaysPerformance = null;
    if (activeSession) {
      const todaysOrders = await Order.find({
        cashierId,
        date: { $gte: new Date(today + 'T00:00:00.000Z') }
      });

      todaysPerformance = {
        sales: todaysOrders.reduce((sum, order) => sum + order.totalPrice, 0),
        transactions: todaysOrders.length,
        itemsSold: todaysOrders.reduce((sum, order) => {
          return sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
        }, 0)
      };
    }

    res.status(200).json({
      success: true,
      hasActiveSession: !!activeSession,
      session: activeSession,
      todaysPerformance,
      screenShareEnabled: activeSession?.screenShareEnabled || false
    });

  } catch (error) {
    console.error('Session status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching session status',
      error: error.message
    });
  }
};

// Update screen sharing status
exports.updateScreenShareStatus = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const { isSharing, peerId } = req.body;
    
    const today = new Date().toISOString().split('T')[0];
    
    const session = await CashierSession.findOne({
      cashierId,
      sessionDate: today,
      status: 'active'
    });

    if (session) {
      session.screenShareEnabled = isSharing;
      session.peerId = peerId;
      session.lastScreenShareUpdate = new Date();
      session.lastActivityTime = new Date();
      await session.save();

      // Emit screen share status update
      if (req.io) {
        req.io.emit('screen-share-status-updated', {
          cashierId,
          isSharing,
          peerId,
          sessionId: session._id
        });
      }
    }

    res.json({
      success: true,
      message: `Screen sharing ${isSharing ? 'enabled' : 'disabled'}`,
      session
    });

  } catch (error) {
    console.error('Update screen share status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating screen share status',
      error: error.message
    });
  }
};

// Update activity timestamp
exports.updateActivity = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const session = await CashierSession.findOne({
      cashierId,
      sessionDate: today,
      status: 'active'
    });

    if (session) {
      session.lastActivityTime = new Date();
      await session.save();
    }

    res.json({
      success: true,
      message: 'Activity updated'
    });

  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating activity',
      error: error.message
    });
  }
};

// Get session history
exports.getSessionHistory = async (req, res) => {
  try {
    const cashierId = req.params.cashierId;
    const today = new Date().toISOString().split('T')[0];

    // Get session history for the cashier
    const sessionHistory = await Order.find({
      cashierId,
      date: { $gte: today }
    }).sort({ date: -1 });

    res.json(sessionHistory);
  } catch (error) {
    console.error('Error fetching session history:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// Mark session as read by admin
exports.markAsReadByAdmin = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { adminId } = req.body;

    const session = await CashierSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    session.isReadByAdmin = true;
    session.adminReadAt = new Date();
    session.adminReadBy = adminId;
    await session.save();

    res.json({
      success: true,
      message: 'Session marked as read',
      session
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error marking session as read',
      error: error.message
    });
  }
};

// Get unread sessions for admin
exports.getUnreadSessions = async (req, res) => {
  try {
    const unreadSessions = await CashierSession.find({
      isReadByAdmin: false,
      status: { $in: ['completed', 'auto-checkout'] }
    })
    .populate('cashierId', 'username email')
    .sort({ checkOutTime: -1 });

    res.json({
      success: true,
      unreadSessions,
      count: unreadSessions.length
    });

  } catch (error) {
    console.error('Get unread sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching unread sessions',
      error: error.message
    });
  }
};