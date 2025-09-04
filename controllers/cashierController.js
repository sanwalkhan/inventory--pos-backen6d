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
      autoScreenShareRequested: true
    });

    await newSession.save();

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

// Enhanced check out with screen sharing cleanup
exports.checkOut = async (req, res) => {
  try {
    const { cashierId } = req.body;

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
    activeSession.checkOutTime = new Date();
    activeSession.status = 'completed';
    activeSession.totalSales = stats.totalSales;
    activeSession.totalTransactions = stats.totalTransactions;
    activeSession.screenShareEnabled = false;

    await activeSession.save();

    res.status(200).json({
      success: true,
      message: 'Checked out successfully. Screen sharing stopped.',
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
      await session.save();
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