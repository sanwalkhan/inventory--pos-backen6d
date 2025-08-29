const CashierSession = require('../models/cashierModel');
const {Order} = require('../models/orderModel');

const User = require('../models/userModel');

// Check in cashier
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
    console.log("cashier",cashier)
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
        session: existingSession
      });
    }

    // Create new session
    const newSession = new CashierSession({
      cashierId,
      cashierName: cashier.username,
      checkInTime: new Date(),
      sessionDate: today
    });

    await newSession.save();

    res.status(201).json({
      success: true,
      message: 'Checked in successfully',
      session: newSession
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

// Check out cashier
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

    await activeSession.save();

    res.status(200).json({
      success: true,
      message: 'Checked out successfully',
      session: activeSession
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

// Get current session status
exports.getSessionStatus = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const today = new Date().toISOString().split('T')[0];

    const activeSession = await CashierSession.findOne({
      cashierId,
      sessionDate: today,
      status: 'active'
    });

    res.status(200).json({
      success: true,
      hasActiveSession: !!activeSession,
      session: activeSession
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

// Get cashier session history
exports.getSessionHistory = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const sessions = await CashierSession.find({ cashierId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .select('-__v');

    const total = await CashierSession.countDocuments({ cashierId });

    res.status(200).json({
      success: true,
      sessions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });

  } catch (error) {
    console.error('Session history error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching session history',
      error: error.message
    });
  }
};




