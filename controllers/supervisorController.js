const CashierSession = require('../models/cashierModel');
const Users = require('../models/userModel');
const { Order } = require("../models/orderModel");

// Enhanced dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    // Total cashiers
    const totalCashiers = await Users.countDocuments({ role: 'cashier' });

    // Active sessions for the date
    const activeSessions = await CashierSession.countDocuments({ 
      sessionDate: date, 
      status: 'active' 
    });

    // Today's sales and transactions from Orders
    const orderStats = await Order.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(date + 'T00:00:00.000Z'),
            $lt: new Date(new Date(date + 'T00:00:00.000Z').getTime() + 24*60*60*1000)
          }
        }
      },
      {
        $group: {
          _id: null,
          todayTotalSales: { $sum: '$totalPrice' },
          todayTransactions: { $sum: 1 },
          totalItems: {
            $sum: {
              $sum: '$items.quantity'
            }
          }
        }
      }
    ]);

    const salesData = orderStats[0] || { 
      todayTotalSales: 0, 
      todayTransactions: 0, 
      totalItems: 0 
    };

    // Top performer
    const topPerformer = await CashierSession.aggregate([
      { $match: { sessionDate: date } },
      {
        $group: {
          _id: '$cashierId',
          totalSales: { $sum: '$totalSales' },
          totalTransactions: { $sum: '$totalTransactions' },
          cashierName: { $first: '$cashierName' }
        }
      },
      { $sort: { totalSales: -1 } },
      { $limit: 1 }
    ]);

    // Average session time
    const avgSessionTime = await CashierSession.aggregate([
      {
        $match: {
          sessionDate: date,
          checkOutTime: { $ne: null }
        }
      },
      {
        $project: {
          sessionDuration: {
            $divide: [
              { $subtract: ['$checkOutTime', '$checkInTime'] },
              3600000 // Convert to hours
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: '$sessionDuration' }
        }
      }
    ]);

    res.json({
      totalCashiers,
      activeSessions,
      todayTotalSales: salesData.todayTotalSales,
      todayTransactions: salesData.todayTransactions,
      totalItems: salesData.totalItems,
      avgSessionTime: avgSessionTime[0]?.avgTime || 0,
      topPerformer: topPerformer[0]?.cashierName || "N/A",
      efficiencyRate: activeSessions > 0 ? (salesData.todayTransactions / activeSessions).toFixed(1) : 0,
      activeAlerts: 0 // Implement based on your business logic
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      message: 'Error fetching dashboard statistics',
      error: error.message
    });
  }
};

// Enhanced cashier monitoring with real-time data
const getCashierMonitoringData = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get today's orders for this cashier
    const todaysOrders = await Order.find({
      cashierId,
      date: { $gte: today },
    }).sort({ date: -1 });

    // Calculate stats
    const todaysSales = todaysOrders.reduce((sum, order) => sum + order.totalPrice, 0);
    const transactionsCount = todaysOrders.length;
    const itemsSold = todaysOrders.reduce((sum, order) => {
      return sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0);
    }, 0);

    // Get all orders for average calculation
    const allOrders = await Order.find({ cashierId });
    const avgSale = allOrders.length > 0 
      ? allOrders.reduce((sum, order) => sum + order.totalPrice, 0) / allOrders.length 
      : 0;

    // Get recent transactions (limit to 10)
    const recentTransactions = todaysOrders.slice(0, 10);

    // Get current session info
    const currentSession = await CashierSession.findOne({
      cashierId,
      sessionDate: today.toISOString().split('T')[0],
      status: 'active'
    });
    const cashierName = Users.findById(cashierId).username;

    // Performance metrics
    const performanceMetrics = {
      avgTransactionValue: transactionsCount > 0 ? (todaysSales / transactionsCount) : 0,
      itemsPerTransaction: transactionsCount > 0 ? (itemsSold / transactionsCount) : 0,
      salesPerHour: currentSession ? 
        (todaysSales / ((new Date() - new Date(currentSession.checkInTime)) / 3600000)) : 0,
    };

    res.json({
      cashierName: cashierName,
      todaysSales: todaysSales.toFixed(2),
      transactionsCount,
      itemsSold,
      avgSale: avgSale.toFixed(2),
      recentTransactions,
      currentSession,
      performanceMetrics,
      lastUpdated: new Date()
    });
  } catch (error) {
    console.error('Error fetching cashier monitoring data:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Send message to cashier
const sendMessageToCashier = async (req, res) => {
  try {
    const { cashierId, message, priority = 'normal' } = req.body;
    const supervisorId = req.decoded.userId;

    if (!cashierId || !message) {
      return res.status(400).json({
        message: 'Cashier ID and message are required'
      });
    }

    // Here you would typically save the message to database
    // For now, we'll just emit via socket

    // The socket handler will handle the actual message sending
    res.json({
      success: true,
      message: 'Message sent successfully',
      timestamp: new Date()
    });

  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      message: 'Error sending message',
      error: error.message
    });
  }
};

// Get active cashiers with enhanced data
const getActiveCashiers = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Get active sessions with user details
    const activeSessions = await CashierSession.find({
      sessionDate: today,
      status: 'active'
    }).populate('cashierId', 'username email');

    // Get today's performance for each cashier
    const cashierPerformance = await Promise.all(
      activeSessions.map(async (session) => {
        const todaysOrders = await Order.find({
          cashierId: session.cashierId._id,
          date: { $gte: new Date(today + 'T00:00:00.000Z') }
        });

        const todaysSales = todaysOrders.reduce((sum, order) => sum + order.totalPrice, 0);
        const transactionsCount = todaysOrders.length;

        return {
          cashierId: session.cashierId._id,
          cashierName: session.cashierId.username,
          sessionData: session,
          todaysSales,
          transactionsCount,
          checkInTime: session.checkInTime,
          active: true,
          hasScreenShare: false // This will be updated by socket handler
        };
      })
    );

    res.json(cashierPerformance);
  } catch (error) {
    console.error('Get active cashiers error:', error);
    res.status(500).json({
      message: 'Error fetching active cashiers',
      error: error.message
    });
  }
};

// Force stop screen sharing
const forceStopScreenShare = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const { reason } = req.body;

    // This would typically update database and notify via socket
    // The socket handler manages the actual screen sharing state

    res.json({
      success: true,
      message: 'Screen sharing stopped',
      cashierId,
      reason
    });

  } catch (error) {
    console.error('Force stop screen share error:', error);
    res.status(500).json({
      message: 'Error stopping screen share',
      error: error.message
    });
  }
};

// Get cashier session analytics
const getCashierAnalytics = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const { days = 7 } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    
    // Get session data for the period
    const sessions = await CashierSession.find({
      cashierId,
      checkInTime: { $gte: startDate }
    }).sort({ checkInTime: -1 });

    // Get orders data for the period
    const orders = await Order.find({
      cashierId,
      date: { $gte: startDate }
    }).sort({ date: -1 });

    // Calculate analytics
    const analytics = {
      totalSessions: sessions.length,
      totalSales: orders.reduce((sum, order) => sum + order.totalPrice, 0),
      totalTransactions: orders.length,
      avgSessionDuration: sessions.length > 0 ? 
        sessions.reduce((sum, session) => {
          if (session.checkOutTime) {
            return sum + ((new Date(session.checkOutTime) - new Date(session.checkInTime)) / 3600000);
          }
          return sum;
        }, 0) / sessions.length : 0,
      peakHours: await calculatePeakHours(orders),
      dailyBreakdown: await calculateDailyBreakdown(orders, days)
    };

    res.json(analytics);
  } catch (error) {
    console.error('Get cashier analytics error:', error);
    res.status(500).json({
      message: 'Error fetching cashier analytics',
      error: error.message
    });
  }
};

// Helper function to calculate peak hours
const calculatePeakHours = async (orders) => {
  const hourlyData = {};
  
  orders.forEach(order => {
    const hour = new Date(order.date).getHours();
    if (!hourlyData[hour]) {
      hourlyData[hour] = { transactions: 0, sales: 0 };
    }
    hourlyData[hour].transactions++;
    hourlyData[hour].sales += order.totalPrice;
  });

  return Object.entries(hourlyData)
    .map(([hour, data]) => ({ hour: parseInt(hour), ...data }))
    .sort((a, b) => b.transactions - a.transactions);
};

// Helper function to calculate daily breakdown
const calculateDailyBreakdown = async (orders, days) => {
  const dailyData = {};
  
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    dailyData[dateStr] = { transactions: 0, sales: 0 };
  }

  orders.forEach(order => {
    const dateStr = new Date(order.date).toISOString().split('T')[0];
    if (dailyData[dateStr]) {
      dailyData[dateStr].transactions++;
      dailyData[dateStr].sales += order.totalPrice;
    }
  });

  return Object.entries(dailyData)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};


const getCashierSessions = async (req, res) => {
  try {
    const { 
      date = new Date().toISOString().split('T')[0],
      cashierId,
      status,
      page = 1,
      limit = 50
    } = req.query;
    
    const skip = (page - 1) * limit;
    
    // Build query
    const query = { sessionDate: date };
    
    if (cashierId && cashierId !== 'all') {
      query.cashierId = cashierId;
    }
    
    if (status) {
      query.status = status;
    }
    
    const sessions = await CashierSession.find(query)
      .populate('cashierId', 'name email')
      .sort({ checkInTime: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await CashierSession.countDocuments(query);
    
    res.json({
      sessions,
      pagination: {
        current: parseInt(page),
        total: Math.ceil(total / limit),
        totalRecords: total
      }
    });
  } catch (error) {
    console.error('Get cashier sessions error:', error);
    res.status(500).json({ 
      message: 'Error fetching cashier sessions',
      error: error.message 
    });
  }
};

// Get cashier performance statistics
const getCashierStats = async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    
    const stats = await CashierSession.aggregate([
      {
        $match: {
          sessionDate: date
        }
      },
      {
        $group: {
          _id: '$cashierId',
          cashierName: { $first: '$cashierName' },
          totalSales: { $sum: '$totalSales' },
          totalTransactions: { $sum: '$totalTransactions' },
          sessions: { $push: '$$ROOT' },
          isActive: {
            $max: {
              $cond: [
                { $eq: ['$status', 'active'] },
                true,
                false
              ]
            }
          }
        }
      },
      {
        $addFields: {
          workingHours: {
            $sum: {
              $map: {
                input: '$sessions',
                as: 'session',
                in: {
                  $divide: [
                    {
                      $subtract: [
                        {
                          $cond: [
                            { $ne: ['$$session.checkOutTime', null] },
                            '$$session.checkOutTime',
                            new Date()
                          ]
                        },
                        '$$session.checkInTime'
                      ]
                    },
                    3600000 // Convert milliseconds to hours
                  ]
                }
              }
            }
          }
        }
      },
      {
        $sort: { totalSales: -1 }
      }
    ]);
    
    res.json(stats);
  } catch (error) {
    console.error('Get cashier stats error:', error);
    res.status(500).json({ 
      message: 'Error fetching cashier statistics',
      error: error.message 
    });
  }
};

// Get detailed cashier performance for a specific cashier
const getCashierDetails = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const { 
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate = new Date().toISOString().split('T')[0]
    } = req.query;
    
    // Get cashier info
    const cashier = await Users.findById(cashierId).select('name email');
    if (!cashier) {
      return res.status(404).json({ message: 'Cashier not found' });
    }
    
    // Get sessions in date range
    const sessions = await CashierSession.find({
      cashierId: cashierId,
      sessionDate: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ sessionDate: -1, checkInTime: -1 });
    
    // Calculate summary statistics
    const summary = await CashierSession.aggregate([
      {
        $match: {
          cashierId: new mongoose.Types.ObjectId(cashierId),
          sessionDate: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalSales' },
          totalTransactions: { $sum: '$totalTransactions' },
          totalSessions: { $sum: 1 },
          avgSalesPerSession: { $avg: '$totalSales' },
          avgTransactionsPerSession: { $avg: '$totalTransactions' }
        }
      }
    ]);
    
    res.json({
      cashier,
      sessions,
      summary: summary[0] || {
        totalSales: 0,
        totalTransactions: 0,
        totalSessions: 0,
        avgSalesPerSession: 0,
        avgTransactionsPerSession: 0
      }
    });
  } catch (error) {
    console.error('Get cashier details error:', error);
    res.status(500).json({ 
      message: 'Error fetching cashier details',
      error: error.message 
    });
  }
};
const getCashierStatsBYid =  async (req, res) => {
  try {
    const todayDateStr = new Date().toISOString().split('T')[0];

    // Get active sessions for today, with full user info
    const sessions = await CashierSession.find({
      sessionDate: todayDateStr,
      status: 'active'
    }).populate('cashierId', 'username email');

    const populatedSessions = await Promise.all(sessions.map(async session => {
      // Get today's orders for this cashier
      const orders = await Order.find({
        cashierId: session.cashierId._id,
        date: {
          $gte: new Date(todayDateStr + 'T00:00:00.000Z'),
          $lt: new Date(new Date(todayDateStr + 'T00:00:00.000Z').getTime() + 24 * 60 * 60 * 1000)
        }
      });
      const totalSales = orders.reduce((sum, order) => sum + order.totalPrice, 0);
      const totalTransactions = orders.length;
      return {
        _id: session._id,
        cashierName: session.cashierId.username,
        cashierId: session.cashierId._id,
        email: session.cashierId.email,
        status: session.status,
        checkInTime: session.checkInTime,
        checkOutTime: session.checkOutTime,
        totalSales,
        totalTransactions
      };
    }));

    res.json({ sessions: populatedSessions });
  } catch (error) {
    console.error('Error fetching active cashier sessions:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


const getSalesTrends = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const cashierId = req.query.cashierId;
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - days + 1);
    startDate.setHours(0, 0, 0, 0);

    const match = {
      date: { $gte: startDate, $lte: endDate }
    };
    if (cashierId && mongoose.Types.ObjectId.isValid(cashierId)) {
      match.cashierId = mongoose.Types.ObjectId(cashierId);
    }

    const trends = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          totalSales: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Fill missing dates with zeroes
    const results = [];
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const dateStr = date.toISOString().split("T")[0];
      const dayData = trends.find((t) => t._id === dateStr);
      results.push({
        _id: dateStr,
        totalSales: dayData ? dayData.totalSales : 0,
        totalTransactions: dayData ? dayData.totalTransactions : 0
      });
    }

    res.json(results);
  } catch (error) {
    console.error("getSalesTrends error:", error);
    res.status(500).json({ message: "Error fetching sales trends", error: error.message });
  }
};

const getHourlyPerformance = async (req, res) => {
  try {
    const dateStr = req.query.date;
    if (!dateStr) {
      return res.status(400).json({ message: "Date parameter is required" });
    }
    const dateStart = new Date(dateStr + "T00:00:00.000Z");
    const dateEnd = new Date(dateStart.getTime() + 24 * 60 * 60 * 1000);

    // Orders aggregation by hour
    const hourlyOrders = await Order.aggregate([
      {
        $match: {
          date: { $gte: dateStart, $lt: dateEnd }
        }
      },
      {
        $group: {
          _id: { $hour: "$date" },
          totalSales: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 }
        }
      }
    ]);

    // Active cashiers count per hour (from sessions)
    const sessions = await CashierSession.find({
      sessionDate: dateStr,
      status: "active"
    });

    const activeCashiersByHour = {};

    sessions.forEach((session) => {
      const hour = new Date(session.checkInTime).getUTCHours();
      activeCashiersByHour[hour] = (activeCashiersByHour[hour] || 0) + 1;
    });

    // Combine data and fill missing hours
    const results = [];
    for (let h = 0; h < 24; h++) {
      const orderData = hourlyOrders.find((o) => o._id === h) || { totalSales: 0, totalTransactions: 0 };
      results.push({
        _id: h,
        totalSales: orderData.totalSales,
        totalTransactions: orderData.totalTransactions,
        activeCashiers: activeCashiersByHour[h] || 0
      });
    }

    res.json(results);
  } catch (error) {
    console.error("getHourlyPerformance error:", error);
    res.status(500).json({ message: "Error fetching hourly performance", error: error.message });
  }
};
const getCashierRankings = async (req, res) => {
  try {
    const dateStr = req.query.date;
    if (!dateStr) {
      return res.status(400).json({ message: "Date parameter is required" });
    }

    const rankings = await CashierSession.aggregate([
      {
        $match: {
          sessionDate: dateStr
        }
      },
      {
        $group: {
          _id: "$cashierId",
          cashierName: { $first: "$cashierName" },
          totalSales: { $sum: "$totalSales" },
          totalTransactions: { $sum: "$totalTransactions" },
          sessions: { $push: "$$ROOT" },
          isActive: {
            $max: {
              $cond: [{ $eq: ["$status", "active"] }, true, false]
            }
          }
        }
      },
      {
        $addFields: {
          workingHours: {
            $sum: {
              $map: {
                input: "$sessions",
                as: "session",
                in: {
                  $divide: [
                    {
                      $subtract: [
                        { $ifNull: ["$$session.checkOutTime", new Date()] },
                        "$$session.checkInTime"
                      ]
                    },
                    3600000
                  ]
                }
              }
            }
          }
        }
      },
      { $sort: { totalSales: -1 } }
    ]);

    res.json(rankings);
  } catch (error) {
    console.error("getCashierRankings error:", error);
    res.status(500).json({ message: "Error fetching cashier rankings", error: error.message });
  }
};
module.exports = {
  getDashboardStats,
  getCashierMonitoringData,
  sendMessageToCashier,
  getActiveCashiers,
  forceStopScreenShare,
  getCashierAnalytics,
  getCashierSessions,
  getCashierDetails,
  getCashierStats,
  getCashierStatsBYid,
  getSalesTrends,
  getHourlyPerformance,
  getCashierRankings
};