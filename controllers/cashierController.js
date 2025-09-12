const CashierDailySession = require('../models/cashierModel');
const { Order } = require('../models/orderModel');
const User = require('../models/userModel');
const { createCashierNotification } = require('./notificationController');

// Enhanced check in with notification
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
    const checkInTime = new Date();

    // Find or create daily session document
    let dailySession = await CashierDailySession.findOne({
      cashierId,
      sessionDate: today
    });

    if (!dailySession) {
      // Create new daily session document
      dailySession = new CashierDailySession({
        cashierId,
        cashierName: cashier.username,
        sessionDate: today,
        sessions: [],
        autoScreenShareRequested: true
      });
    }

    // Check if there's already an active session
    const activeSessionIndex = dailySession.sessions.findIndex(session => session.isActive);
    
    if (activeSessionIndex !== -1) {
      // Update existing active session's last activity
      dailySession.sessions[activeSessionIndex].lastActivityTime = checkInTime;
      dailySession.lastActivityTime = checkInTime;
      await dailySession.save();

      return res.status(200).json({
        success: true,
        message: 'Already checked in',
        session: {
          _id: dailySession._id,
          checkInTime: dailySession.sessions[activeSessionIndex].checkInTime,
          totalSales: dailySession.totalDailySales,
          totalTransactions: dailySession.totalDailyTransactions,
          currentlyActive: true
        },
        screenShareEnabled: true
      });
    }

    // Create new session entry
    const newSessionEntry = {
      checkInTime,
      isActive: true,
      screenShareEnabled: true,
      autoScreenShareRequested: true,
      lastActivityTime: checkInTime
    };

    dailySession.sessions.push(newSessionEntry);
    dailySession.currentlyActive = true;
    dailySession.activeSessionIndex = dailySession.sessions.length - 1;
    dailySession.lastActivityTime = checkInTime;

    await dailySession.save();

    // Create notification
    try {
      await createCashierNotification('check-in', {
        cashierId,
        cashierName: cashier.username
      }, {
        _id: dailySession._id,
        checkInTime: newSessionEntry.checkInTime
      }, req.io);
    } catch (notificationError) {
      console.error('Failed to create check-in notification:', notificationError);
    }

    // Emit check-in event via socket
    if (req.io) {
      req.io.emit('cashier-checked-in', {
        cashierId,
        sessionData: {
          _id: dailySession._id,
          checkInTime: newSessionEntry.checkInTime,
          totalSales: dailySession.totalDailySales,
          totalTransactions: dailySession.totalDailyTransactions
        },
        cashierName: cashier.username
      });
    }

    res.status(201).json({
      success: true,
      message: 'Checked in successfully. Screen sharing will start automatically.',
      session: {
        _id: dailySession._id,
        checkInTime: newSessionEntry.checkInTime,
        totalSales: dailySession.totalDailySales,
        totalTransactions: dailySession.totalDailyTransactions,
        currentlyActive: true
      },
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

// Enhanced check out with notification
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
    const checkOutTime = new Date();

    // Find daily session document
    const dailySession = await CashierDailySession.findOne({
      cashierId,
      sessionDate: today,
      currentlyActive: true
    });

    if (!dailySession) {
      return res.status(404).json({
        success: false,
        message: 'No active session found for today'
      });
    }

    // Find active session
    const activeSessionIndex = dailySession.activeSessionIndex;
    if (activeSessionIndex === null || !dailySession.sessions[activeSessionIndex] || !dailySession.sessions[activeSessionIndex].isActive) {
      return res.status(404).json({
        success: false,
        message: 'No active session found'
      });
    }

    const activeSession = dailySession.sessions[activeSessionIndex];

    // Calculate session statistics
    const sessionStats = await Order.aggregate([
      {
        $match: {
          cashierId: cashierId,
          date: {
            $gte: activeSession.checkInTime,
            $lte: checkOutTime
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

    // Update the active session
    activeSession.checkOutTime = checkOutTime;
    activeSession.isActive = false;
    activeSession.checkoutReason = reason || 'manual';
    activeSession.checkoutReasonDetails = reasonDetails || null;
    activeSession.sessionDuration = Math.round((checkOutTime - activeSession.checkInTime) / (1000 * 60));
    activeSession.salesDuringSession = stats.totalSales;
    activeSession.transactionsDuringSession = stats.totalTransactions;
    activeSession.screenShareEnabled = false;

    // Update daily session status
    dailySession.currentlyActive = false;
    dailySession.activeSessionIndex = null;
    dailySession.lastActivityTime = checkOutTime;

    await dailySession.save();

    // Create notification
    try {
      await createCashierNotification('check-out', {
        cashierId,
        cashierName: dailySession.cashierName
      }, {
        _id: dailySession._id,
        checkInTime: activeSession.checkInTime,
        checkOutTime: activeSession.checkOutTime,
        sessionDuration: activeSession.sessionDuration,
        salesDuringSession: activeSession.salesDuringSession,
        transactionsDuringSession: activeSession.transactionsDuringSession,
        reason: activeSession.checkoutReason
      }, req.io);
    } catch (notificationError) {
      console.error('Failed to create check-out notification:', notificationError);
    }

    // Emit check-out event via socket
    if (req.io) {
      req.io.emit('cashier-checked-out', {
        cashierId,
        sessionData: {
          _id: dailySession._id,
          checkInTime: activeSession.checkInTime,
          checkOutTime: activeSession.checkOutTime,
          totalSales: dailySession.totalDailySales,
          totalTransactions: dailySession.totalDailyTransactions
        },
        reason: activeSession.checkoutReason,
        reasonDetails: activeSession.checkoutReasonDetails
      });
    }

    res.status(200).json({
      success: true,
      message: `Checked out successfully. Reason: ${reason || 'manual'}`,
      session: {
        _id: dailySession._id,
        checkInTime: activeSession.checkInTime,
        checkOutTime: activeSession.checkOutTime,
        totalSales: dailySession.totalDailySales,
        totalTransactions: dailySession.totalDailyTransactions
      },
      sessionStats: stats
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

// Auto checkout with notification
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
    const checkOutTime = new Date();

    // Find daily session document
    const dailySession = await CashierDailySession.findOne({
      cashierId,
      sessionDate: today,
      currentlyActive: true
    });

    if (!dailySession) {
      return res.status(404).json({
        success: false,
        message: 'No active session found for today'
      });
    }

    // Find active session
    const activeSessionIndex = dailySession.activeSessionIndex;
    if (activeSessionIndex === null || !dailySession.sessions[activeSessionIndex] || !dailySession.sessions[activeSessionIndex].isActive) {
      return res.status(404).json({
        success: false,
        message: 'No active session found'
      });
    }

    const activeSession = dailySession.sessions[activeSessionIndex];

    // Calculate session statistics
    const sessionStats = await Order.aggregate([
      {
        $match: {
          cashierId: cashierId,
          date: {
            $gte: activeSession.checkInTime,
            $lte: checkOutTime
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

    // Update the active session
    activeSession.checkOutTime = checkOutTime;
    activeSession.isActive = false;
    activeSession.checkoutReason = reason;
    activeSession.checkoutReasonDetails = reasonDetails;
    activeSession.sessionDuration = Math.round((checkOutTime - activeSession.checkInTime) / (1000 * 60));
    activeSession.salesDuringSession = stats.totalSales;
    activeSession.transactionsDuringSession = stats.totalTransactions;
    activeSession.screenShareEnabled = false;

    // Update daily session status
    dailySession.currentlyActive = false;
    dailySession.activeSessionIndex = null;
    dailySession.lastActivityTime = checkOutTime;

    await dailySession.save();

    // Create notification
    try {
      await createCashierNotification('auto-checkout', {
        cashierId,
        cashierName: dailySession.cashierName
      }, {
        _id: dailySession._id,
        checkInTime: activeSession.checkInTime,
        checkOutTime: activeSession.checkOutTime,
        sessionDuration: activeSession.sessionDuration,
        reason: activeSession.checkoutReason,
        reasonDetails: activeSession.checkoutReasonDetails
      }, req.io);
    } catch (notificationError) {
      console.error('Failed to create auto-checkout notification:', notificationError);
    }

    // Emit auto-checkout event via socket
    if (req.io) {
      req.io.emit('cashier-auto-checked-out', {
        cashierId,
        sessionData: {
          _id: dailySession._id,
          checkInTime: activeSession.checkInTime,
          checkOutTime: activeSession.checkOutTime,
          totalSales: dailySession.totalDailySales,
          totalTransactions: dailySession.totalDailyTransactions
        },
        reason: activeSession.checkoutReason,
        reasonDetails: activeSession.checkoutReasonDetails
      });
    }

    res.status(200).json({
      success: true,
      message: `Auto checked out. Reason: ${reason}`,
      session: {
        _id: dailySession._id,
        checkInTime: activeSession.checkInTime,
        checkOutTime: activeSession.checkOutTime,
        totalSales: dailySession.totalDailySales,
        totalTransactions: dailySession.totalDailyTransactions
      },
      sessionStats: stats
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

// Update screen sharing status with notification
exports.updateScreenShareStatus = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const { isSharing, peerId } = req.body;
    
    const today = new Date().toISOString().split('T')[0];
    
    const dailySession = await CashierDailySession.findOne({
      cashierId,
      sessionDate: today,
      currentlyActive: true
    });

    if (dailySession && dailySession.activeSessionIndex !== null) {
      const activeSession = dailySession.sessions[dailySession.activeSessionIndex];
      const wasSharing = activeSession.screenShareEnabled;
      
      activeSession.screenShareEnabled = isSharing;
      activeSession.peerId = peerId;
      activeSession.lastScreenShareUpdate = new Date();
      activeSession.lastActivityTime = new Date();
      dailySession.lastActivityTime = new Date();
      
      await dailySession.save();

      // Create notification if screen sharing was disconnected
      if (wasSharing && !isSharing) {
        try {
          await createCashierNotification('screen-share-disconnected', {
            cashierId,
            cashierName: dailySession.cashierName
          }, {
            _id: dailySession._id
          }, req.io);
        } catch (notificationError) {
          console.error('Failed to create screen share notification:', notificationError);
        }
      }

      // Emit screen share status update
      if (req.io) {
        req.io.emit('screen-share-status-updated', {
          cashierId,
          isSharing,
          peerId,
          sessionId: dailySession._id
        });
      }
    }

    res.json({
      success: true,
      message: `Screen sharing ${isSharing ? 'enabled' : 'disabled'}`,
      session: dailySession
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

// Keep all other existing methods unchanged
exports.getSessionStatus = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const dailySession = await CashierDailySession.findOne({
      cashierId,
      sessionDate: today
    });

    let hasActiveSession = false;
    let activeSession = null;
    let todaysPerformance = null;

    if (dailySession) {
      hasActiveSession = dailySession.currentlyActive;
      
      if (hasActiveSession && dailySession.activeSessionIndex !== null) {
        activeSession = dailySession.sessions[dailySession.activeSessionIndex];
      }

      // Get today's performance
      todaysPerformance = {
        sales: dailySession.totalDailySales,
        transactions: dailySession.totalDailyTransactions,
        totalCheckIns: dailySession.totalCheckIns,
        totalCheckOuts: dailySession.totalCheckOuts,
        totalSessionDuration: dailySession.totalSessionDuration,
        checkoutReasonsSummary: dailySession.checkoutReasonsSummary
      };
    }

    res.status(200).json({
      success: true,
      hasActiveSession,
      session: activeSession ? {
        _id: dailySession._id,
        checkInTime: activeSession.checkInTime,
        totalSales: dailySession.totalDailySales,
        totalTransactions: dailySession.totalDailyTransactions
      } : null,
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

exports.updateActivity = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const dailySession = await CashierDailySession.findOne({
      cashierId,
      sessionDate: today,
      currentlyActive: true
    });

    if (dailySession && dailySession.activeSessionIndex !== null) {
      const activeSession = dailySession.sessions[dailySession.activeSessionIndex];
      activeSession.lastActivityTime = new Date();
      dailySession.lastActivityTime = new Date();
      await dailySession.save();
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

exports.getSessionHistory = async (req, res) => {
  try {
    const cashierId = req.params.cashierId;
    const today = new Date().toISOString().split('T')[0];

    // Get daily session with all check-ins/check-outs
    const dailySession = await CashierDailySession.findOne({
      cashierId,
      sessionDate: today
    });

    if (!dailySession) {
      return res.json({
        success: true,
        sessionHistory: [],
        dailyStats: null
      });
    }

    // Get order history for the day
    const orderHistory = await Order.find({
      cashierId,
      date: { $gte: new Date(today + 'T00:00:00.000Z') }
    }).sort({ date: -1 });

    res.json({
      success: true,
      sessionHistory: dailySession.sessions,
      orderHistory,
      dailyStats: {
        totalCheckIns: dailySession.totalCheckIns,
        totalCheckOuts: dailySession.totalCheckOuts,
        totalSessionDuration: dailySession.totalSessionDuration,
        totalDailySales: dailySession.totalDailySales,
        totalDailyTransactions: dailySession.totalDailyTransactions,
        checkoutReasonsSummary: dailySession.checkoutReasonsSummary
      }
    });
  } catch (error) {
    console.error('Error fetching session history:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

exports.markAsReadByAdmin = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { adminId } = req.body;

    const dailySession = await CashierDailySession.findById(sessionId);
    if (!dailySession) {
      return res.status(404).json({
        success: false,
        message: 'Daily session not found'
      });
    }

    dailySession.isReadByAdmin = true;
    dailySession.adminReadAt = new Date();
    dailySession.adminReadBy = adminId;
    await dailySession.save();

    res.json({
      success: true,
      message: 'Daily session marked as read',
      session: dailySession
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

exports.getUnreadSessions = async (req, res) => {
  try {
    const unreadSessions = await CashierDailySession.find({
      isReadByAdmin: false,
      currentlyActive: false,
      totalCheckOuts: { $gt: 0 }
    })
    .populate('cashierId', 'username email')
    .sort({ updatedAt: -1 });

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

exports.getAllDailySessions = async (req, res) => {
  try {
    const { startDate, endDate, cashierId } = req.query;
    
    let query = {};
    
    if (cashierId) {
      query.cashierId = cashierId;
    }
    
    if (startDate && endDate) {
      query.sessionDate = {
        $gte: startDate,
        $lte: endDate
      };
    } else if (startDate) {
      query.sessionDate = { $gte: startDate };
    } else if (endDate) {
      query.sessionDate = { $lte: endDate };
    }

    const dailySessions = await CashierDailySession.find(query)
      .populate('cashierId', 'username email')
      .sort({ sessionDate: -1, createdAt: -1 });

    res.json({
      success: true,
      dailySessions,
      count: dailySessions.length
    });

  } catch (error) {
    console.error('Get all daily sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching daily sessions',
      error: error.message
    });
  }
};