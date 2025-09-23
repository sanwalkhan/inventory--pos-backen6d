const CashierDailySession = require('../models/cashierModel'); // Fixed model import
const Users = require('../models/userModel');
const { Order } = require("../models/orderModel");
const mongoose = require('mongoose');

// Get cashier sessions (FIXED VERSION)
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
    
    // Build query for CashierDailySession model
    const query = { sessionDate: date };
    
    if (cashierId && cashierId !== 'all') {
      query.cashierId = new mongoose.Types.ObjectId(cashierId);
    }
    
    // Get sessions and populate cashier info
    const sessions = await CashierDailySession.find(query)
      .populate('cashierId', 'username email')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    // Get actual orders data for today to calculate real sales/transactions
    const processedSessions = await Promise.all(sessions.map(async (session) => {
      const ordersToday = await Order.find({
        cashierId: session.cashierId._id,
        date: {
          $gte: new Date(date + 'T00:00:00.000Z'),
          $lt: new Date(new Date(date + 'T00:00:00.000Z').getTime() + 24 * 60 * 60 * 1000)
        }
      });
      
      const totalSales = ordersToday.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
      const totalTransactions = ordersToday.length;
      
      // Determine current status based on sessions array
      let currentStatus = 'completed';
      let checkInTime = null;
      let checkOutTime = null;
      let totalActiveMinutes = 0;
      
      if (session.sessions && session.sessions.length > 0) {
        const activeSessions = session.sessions.filter(s => s.isActive);
        if (activeSessions.length > 0) {
          currentStatus = 'active';
          checkInTime = activeSessions[0].checkInTime;
        } else {
          // Get the latest session
          const latestSession = session.sessions[session.sessions.length - 1];
          checkInTime = latestSession.checkInTime;
          checkOutTime = latestSession.checkOutTime;
        }
        
        // Calculate total active time from all sessions
        session.sessions.forEach(sessionEntry => {
          const checkIn = new Date(sessionEntry.checkInTime);
          const checkOut = sessionEntry.checkOutTime ? new Date(sessionEntry.checkOutTime) : new Date();
          const durationMinutes = Math.floor((checkOut - checkIn) / (1000 * 60));
          totalActiveMinutes += durationMinutes;
        });
      }
      
      return {
        _id: session._id,
        cashierId: session.cashierId,
        cashierName: session.cashierId.username,
        email: session.cashierId.email,
        sessionDate: session.sessionDate,
        status: currentStatus,
        checkInTime: checkInTime,
        checkOutTime: checkOutTime,
        totalSales: totalSales,
        totalTransactions: totalTransactions,
        sessionCount: session.sessions ? session.sessions.length : 0,
        totalActiveMinutes: totalActiveMinutes,
        
        // Include detailed session information
        sessions: session.sessions || [],
        
        // Include summary data from the model
        totalCheckIns: session.totalCheckIns || 0,
        totalCheckOuts: session.totalCheckOuts || 0,
        totalSessionDuration: session.totalSessionDuration || 0,
        totalDailySales: session.totalDailySales || 0,
        totalDailyTransactions: session.totalDailyTransactions || 0,
        currentlyActive: session.currentlyActive || false,
        activeSessionIndex: session.activeSessionIndex,
        checkoutReasonsSummary: session.checkoutReasonsSummary || {},
        autoScreenShareRequested: session.autoScreenShareRequested || false,
        isReadByAdmin: session.isReadByAdmin || false,
        adminReadAt: session.adminReadAt,
        adminReadBy: session.adminReadBy,
        lastActivityTime: session.lastActivityTime
      };
    }));
    
    const total = await CashierDailySession.countDocuments(query);
    
    res.json({
      sessions: processedSessions,
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

// Get active cashiers with proper session data
const getCashierStatsBYid = async (req, res) => {
  try {
    const todayDateStr = new Date().toISOString().split('T')[0];

    // Get all sessions for today
    const dailySessions = await CashierDailySession.find({
      sessionDate: todayDateStr
    }).populate('cashierId', 'username email');

    const activeCashiers = [];

    for (const dailySession of dailySessions) {
      // Check if cashier has any active sessions
      const hasActiveSession = dailySession.sessions && 
        dailySession.sessions.some(session => session.isActive);
      
      if (hasActiveSession) {
        // Get today's orders for this cashier
        const orders = await Order.find({
          cashierId: dailySession.cashierId._id,
          date: {
            $gte: new Date(todayDateStr + 'T00:00:00.000Z'),
            $lt: new Date(new Date(todayDateStr + 'T00:00:00.000Z').getTime() + 24 * 60 * 60 * 1000)
          }
        });

        const totalSales = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
        const totalTransactions = orders.length;

        // Get the current active session
        const activeSession = dailySession.sessions.find(session => session.isActive);

        activeCashiers.push({
          _id: dailySession._id,
          cashierName: dailySession.cashierId.username,
          cashierId: dailySession.cashierId._id,
          email: dailySession.cashierId.email,
          status: 'active',
          checkInTime: activeSession ? activeSession.checkInTime : null,
          checkOutTime: null,
          totalSales,
          totalTransactions,
          sessionDate: dailySession.sessionDate
        });
      }
    }

    res.json({ sessions: activeCashiers });
  } catch (error) {
    console.error('Error fetching active cashier sessions:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Enhanced dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    
    // Total cashiers
    const totalCashiers = await Users.countDocuments({ role: 'cashier' });

    // Active sessions for the date
    const activeSessions = await CashierDailySession.aggregate([
      {
        $match: { sessionDate: date }
      },
      {
        $project: {
          cashierId: 1,
          cashierName: 1,
          hasActiveSession: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: "$sessions",
                    cond: { $eq: ["$$this.isActive", true] }
                  }
                }
              },
              0
            ]
          }
        }
      },
      {
        $match: { hasActiveSession: true }
      },
      {
        $count: "activeCount"
      }
    ]);

    const activeSessionsCount = activeSessions[0]?.activeCount || 0;

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

    // Top performer based on actual orders
    const topPerformer = await Order.aggregate([
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
          _id: '$cashierId',
          totalSales: { $sum: '$totalPrice' },
          totalTransactions: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'cashier'
        }
      },
      {
        $unwind: '$cashier'
      },
      { $sort: { totalSales: -1 } },
      { $limit: 1 }
    ]);

    // Average session time from daily sessions
    const avgSessionTime = await CashierDailySession.aggregate([
      {
        $match: { sessionDate: date }
      },
      {
        $unwind: '$sessions'
      },
      {
        $match: {
          'sessions.checkOutTime': { $ne: null }
        }
      },
      {
        $project: {
          sessionDuration: {
            $divide: [
              { $subtract: ['$sessions.checkOutTime', '$sessions.checkInTime'] },
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
      activeSessions: activeSessionsCount,
      todayTotalSales: salesData.todayTotalSales,
      todayTransactions: salesData.todayTransactions,
      totalItems: salesData.totalItems,
      avgSessionTime: avgSessionTime[0]?.avgTime || 0,
      topPerformer: topPerformer[0]?.cashier.username || "N/A",
      efficiencyRate: activeSessionsCount > 0 ? (salesData.todayTransactions / activeSessionsCount).toFixed(1) : 0,
      activeAlerts: 0
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
    const today = new Date().toISOString().split('T')[0];

    // Get today's orders for this cashier
    const todaysOrders = await Order.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      date: {
        $gte: new Date(today + 'T00:00:00.000Z'),
        $lt: new Date(new Date(today + 'T00:00:00.000Z').getTime() + 24 * 60 * 60 * 1000)
      }
    }).sort({ date: -1 });

    // Calculate stats
    const todaysSales = todaysOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
    const transactionsCount = todaysOrders.length;
    const itemsSold = todaysOrders.reduce((sum, order) => {
      return sum + order.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0);
    }, 0);

    // Get all orders for average calculation
    const allOrders = await Order.find({ cashierId: new mongoose.Types.ObjectId(cashierId) });
    const avgSale = allOrders.length > 0 
      ? allOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0) / allOrders.length 
      : 0;

    // Get recent transactions (limit to 10)
    const recentTransactions = todaysOrders.slice(0, 10);

    // Get current session info
    const currentSession = await CashierDailySession.findOne({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      sessionDate: today
    });

    const cashier = await Users.findById(cashierId).select('username');

    // Performance metrics
    const performanceMetrics = {
      avgTransactionValue: transactionsCount > 0 ? (todaysSales / transactionsCount) : 0,
      itemsPerTransaction: transactionsCount > 0 ? (itemsSold / transactionsCount) : 0,
      salesPerHour: 0
    };

    // Calculate sales per hour if there's an active session
    if (currentSession && currentSession.sessions) {
      const activeSession = currentSession.sessions.find(s => s.isActive);
      if (activeSession) {
        const hoursWorked = (new Date() - new Date(activeSession.checkInTime)) / 3600000;
        performanceMetrics.salesPerHour = hoursWorked > 0 ? (todaysSales / hoursWorked) : 0;
      }
    }

    res.json({
      cashierName: cashier?.username || 'Unknown',
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
    
    // Get active sessions
    const activeSessions = await CashierDailySession.find({
      sessionDate: today
    }).populate('cashierId', 'username email');

    const activeSessionsFiltered = activeSessions.filter(session => {
      return session.sessions && session.sessions.some(s => s.isActive);
    });

    // Get today's performance for each cashier
    const cashierPerformance = await Promise.all(
      activeSessionsFiltered.map(async (session) => {
        const todaysOrders = await Order.find({
          cashierId: session.cashierId._id,
          date: { $gte: new Date(today + 'T00:00:00.000Z') }
        });

        const todaysSales = todaysOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0);
        const transactionsCount = todaysOrders.length;
        
        const activeSession = session.sessions.find(s => s.isActive);

        return {
          cashierId: session.cashierId._id,
          cashierName: session.cashierId.username,
          sessionData: session,
          todaysSales,
          transactionsCount,
          checkInTime: activeSession ? activeSession.checkInTime : null,
          active: true,
          hasScreenShare: false
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
    const sessions = await CashierDailySession.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      sessionDate: { 
        $gte: startDate.toISOString().split('T')[0],
        $lte: new Date().toISOString().split('T')[0]
      }
    }).sort({ sessionDate: -1 });

    // Get orders data for the period
    const orders = await Order.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      date: { $gte: startDate }
    }).sort({ date: -1 });

    // Calculate analytics
    const analytics = {
      totalSessions: sessions.reduce((sum, session) => sum + (session.sessions ? session.sessions.length : 0), 0),
      totalSales: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      totalTransactions: orders.length,
      avgSessionDuration: 0,
      peakHours: await calculatePeakHours(orders),
      dailyBreakdown: await calculateDailyBreakdown(orders, days)
    };

    // Calculate average session duration
    let totalDuration = 0;
    let completedSessions = 0;
    
    sessions.forEach(dailySession => {
      if (dailySession.sessions) {
        dailySession.sessions.forEach(session => {
          if (session.checkOutTime) {
            totalDuration += (new Date(session.checkOutTime) - new Date(session.checkInTime)) / 3600000;
            completedSessions++;
          }
        });
      }
    });
    
    analytics.avgSessionDuration = completedSessions > 0 ? totalDuration / completedSessions : 0;

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
    hourlyData[hour].sales += order.totalPrice || 0;
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
      dailyData[dateStr].sales += order.totalPrice || 0;
    }
  });

  return Object.entries(dailyData)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
};

// Get cashier performance statistics
const getCashierStats = async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    
    const stats = await CashierDailySession.aggregate([
      {
        $match: {
          sessionDate: date
        }
      },
      {
        $lookup: {
          from: 'orders',
          let: { 
            cashierId: '$cashierId',
            sessionDate: '$sessionDate'
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$cashierId', '$cashierId'] },
                    { $gte: ['$date', { $dateFromString: { dateString: { $concat: ['$sessionDate', 'T00:00:00.000Z'] } } }] },
                    { $lt: ['$date', { $dateFromString: { dateString: { $concat: ['$sessionDate', 'T23:59:59.999Z'] } } }] }
                  ]
                }
              }
            }
          ],
          as: 'orders'
        }
      },
      {
        $group: {
          _id: '$cashierId',
          cashierName: { $first: '$cashierName' },
          totalSales: { 
            $sum: {
              $sum: '$orders.totalPrice'
            }
          },
          totalTransactions: {
            $sum: { $size: '$orders' }
          },
          sessions: { $push: '$ROOT' },
          isActive: {
            $max: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: { $ifNull: ['$sessions', []] },
                      cond: { $eq: ['$this.isActive', true] }
                    }
                  }
                },
                0
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
                input: { $ifNull: [{ $arrayElemAt: ['$sessions.sessions', 0] }, []] },
                as: 'session',
                in: {
                  $divide: [
                    {
                      $subtract: [
                        {
                          $cond: [
                            { $ne: ['$session.checkOutTime', null] },
                            '$session.checkOutTime',
                            new Date()
                          ]
                        },
                        '$session.checkInTime'
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
    const cashier = await Users.findById(cashierId).select('username email');
    if (!cashier) {
      return res.status(404).json({ message: 'Cashier not found' });
    }
    
    // Get sessions in date range
    const sessions = await CashierDailySession.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      sessionDate: {
        $gte: startDate,
        $lte: endDate
      }
    }).sort({ sessionDate: -1 });
    
    // Get orders for summary
    const orders = await Order.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      date: {
        $gte: new Date(startDate + 'T00:00:00.000Z'),
        $lte: new Date(endDate + 'T23:59:59.999Z')
      }
    });

    const summary = {
      totalSales: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      totalTransactions: orders.length,
      totalSessions: sessions.reduce((sum, session) => sum + (session.sessions ? session.sessions.length : 0), 0),
      avgSalesPerSession: 0,
      avgTransactionsPerSession: 0
    };

    const totalSessions = summary.totalSessions;
    if (totalSessions > 0) {
      summary.avgSalesPerSession = summary.totalSales / totalSessions;
      summary.avgTransactionsPerSession = summary.totalTransactions / totalSessions;
    }
    
    res.json({
      cashier,
      sessions,
      summary
    });
  } catch (error) {
    console.error('Get cashier details error:', error);
    res.status(500).json({ 
      message: 'Error fetching cashier details',
      error: error.message 
    });
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
      match.cashierId = new mongoose.Types.ObjectId(cashierId);
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

    // Active cashiers count per hour (from daily sessions)
    const sessions = await CashierDailySession.find({
      sessionDate: dateStr
    });

    const activeCashiersByHour = {};

    sessions.forEach((dailySession) => {
      if (dailySession.sessions) {
        dailySession.sessions.forEach((session) => {
          if (session.isActive) {
            const hour = new Date(session.checkInTime).getUTCHours();
            activeCashiersByHour[hour] = (activeCashiersByHour[hour] || 0) + 1;
          }
        });
      }
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

    // Get cashier rankings based on actual orders
    const rankings = await Order.aggregate([
      {
        $match: {
          date: {
            $gte: new Date(dateStr + 'T00:00:00.000Z'),
            $lt: new Date(new Date(dateStr + 'T00:00:00.000Z').getTime() + 24 * 60 * 60 * 1000)
          }
        }
      },
      {
        $group: {
          _id: '$cashierId',
          totalSales: { $sum: '$totalPrice' },
          totalTransactions: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'cashier'
        }
      },
      {
        $unwind: '$cashier'
      },
      {
        $lookup: {
          from: 'cashierdailysessions',
          let: { cashierId: '$_id', sessionDate: dateStr },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$cashierId', '$cashierId'] },
                    { $eq: ['$sessionDate', '$sessionDate'] }
                  ]
                }
              }
            }
          ],
          as: 'session'
        }
      },
      {
        $addFields: {
          cashierName: '$cashier.username',
          isActive: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: { $ifNull: [{ $arrayElemAt: ['$session.sessions', 0] }, []] },
                    cond: { $eq: ['$this.isActive', true] }
                  }
                }
              },
              0
            ]
          },
          workingHours: {
            $sum: {
              $map: {
                input: { $ifNull: [{ $arrayElemAt: ['$session.sessions', 0] }, []] },
                as: 'sess',
                in: {
                  $divide: [
                    {
                      $subtract: [
                        { $ifNull: ['$sess.checkOutTime', new Date()] },
                        '$sess.checkInTime'
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


const getDetailedCashierReports = async (req, res) => {
  try {
    const { date } = req.query;
    
    let startDate, endDate;
    
    // Parse date parameter
    if (date && date.includes('_')) {
      // Date range format: "2024-01-01_2024-01-07"
      const [start, end] = date.split('_');
      startDate = start;
      endDate = end;
    } else if (date) {
      // Single date format: "2024-01-01"
      startDate = date;
      endDate = date;
    } else {
      // Default to today
      const today = new Date().toISOString().split('T')[0];
      startDate = today;
      endDate = today;
    }

    // Build match criteria for sessionDate (string format in your model)
    const matchCriteria = {
      sessionDate: {
        $gte: startDate,
        $lte: endDate
      }
    };

    // Aggregate cashier data using existing data in CashierDailySession
    const cashierReports = await CashierDailySession.aggregate([
      {
        $match: matchCriteria
      },
      {
        $lookup: {
          from: 'users',
          localField: 'cashierId',
          foreignField: '_id',
          as: 'cashierInfo'
        }
      },
      {
        $unwind: '$cashierInfo'
      },
      {
        $group: {
          _id: '$cashierId',
          cashierName: { $first: '$cashierInfo.username' },
          email: { $first: '$cashierInfo.email' },
          
          // Session metrics from your model structure
          sessionCount: { $sum: { $size: { $ifNull: ['$sessions', []] } } },
          currentlyActive: { $max: '$currentlyActive' },
          
          // Calculate total active minutes from sessions array
          totalActiveMinutes: {
            $sum: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$sessions', []] },
                  as: 'session',
                  in: {
                    $cond: [
                      { $ne: ['$$session.checkOutTime', null] },
                      '$$session.sessionDuration', // Use stored sessionDuration
                      {
                        $divide: [
                          {
                            $subtract: [new Date(), '$$session.checkInTime']
                          },
                          60000 // Convert to minutes for active sessions
                        ]
                      }
                    ]
                  }
                }
              }
            }
          },
          
          // Use stored sales and transaction data from the model
          totalSales: { $sum: '$totalDailySales' },
          totalTransactions: { $sum: '$totalDailyTransactions' },
          
          // Collect session details
          sessionDetails: {
            $push: {
              sessionDate: '$sessionDate',
              sessions: '$sessions',
              dailySales: '$totalDailySales', // Use stored value
              dailyTransactions: '$totalDailyTransactions', // Use stored value
              totalCheckIns: '$totalCheckIns',
              totalCheckOuts: '$totalCheckOuts',
              checkoutReasonsSummary: '$checkoutReasonsSummary'
            }
          },
          
          // Get first and last activity across all sessions
          firstCheckIn: {
            $min: {
              $min: {
                $map: {
                  input: { $ifNull: ['$sessions', []] },
                  as: 'session',
                  in: '$$session.checkInTime'
                }
              }
            }
          },
          
          lastCheckOut: {
            $max: {
              $max: {
                $map: {
                  input: { $ifNull: ['$sessions', []] },
                  as: 'session',
                  in: '$$session.checkOutTime'
                }
              }
            }
          }
        }
      },
      {
        $addFields: {
          cashierId: '$_id',
          currentStatus: {
            $cond: [
              { $eq: ['$currentlyActive', true] },
              'active',
              'completed'
            ]
          },
          averageSessionDuration: {
            $cond: [
              { $gt: ['$sessionCount', 0] },
              { $divide: ['$totalActiveMinutes', '$sessionCount'] },
              0
            ]
          },
          performanceRating: {
            $switch: {
              branches: [
                { case: { $gte: ['$totalSales', 10000] }, then: 'Excellent' },
                { case: { $gte: ['$totalSales', 5000] }, then: 'Good' },
                { case: { $gte: ['$totalSales', 2000] }, then: 'Average' },
                { case: { $gte: ['$totalSales', 500] }, then: 'Below Average' }
              ],
              default: 'Poor'
            }
          }
        }
      },
      {
        $sort: { totalSales: -1 }
      }
    ]);

    // Process the results to match your expected format
    const processedReports = cashierReports.map(cashier => {
      // Flatten all sessions from all days for this cashier
      const allSessions = [];
      cashier.sessionDetails.forEach(dayDetail => {
        if (dayDetail.sessions && dayDetail.sessions.length > 0) {
          dayDetail.sessions.forEach((session, index) => {
            allSessions.push({
              index: allSessions.length + 1,
              sessionDate: dayDetail.sessionDate,
              sessionId: session._id,
              checkInTime: session.checkInTime,
              checkOutTime: session.checkOutTime,
              isActive: session.isActive,
              checkoutReason: session.checkoutReason,
              checkoutReasonDetails: session.checkoutReasonDetails,
              duration: session.sessionDuration || 0, // Use stored duration
              salesDuringSession: session.salesDuringSession || 0,
              transactionsDuringSession: session.transactionsDuringSession || 0
            });
          });
        }
      });

      return {
        ...cashier,
        totalActiveMinutes: Math.round(cashier.totalActiveMinutes || 0),
        averageSessionDuration: Math.round(cashier.averageSessionDuration || 0),
        totalSales: parseFloat((cashier.totalSales || 0).toFixed(2)),
        averageSalePerTransaction: cashier.totalTransactions > 0 
          ? parseFloat(((cashier.totalSales || 0) / cashier.totalTransactions).toFixed(2))
          : 0,
        sessionBreakdown: allSessions
      };
    });

    res.json({
      success: true,
      data: processedReports,
      summary: {
        totalCashiers: processedReports.length,
        activeCashiers: processedReports.filter(c => c.currentStatus === 'active').length,
        totalSalesAllCashiers: processedReports.reduce((sum, c) => sum + (c.totalSales || 0), 0),
        totalTransactionsAllCashiers: processedReports.reduce((sum, c) => sum + (c.totalTransactions || 0), 0),
        totalActiveTimeAllCashiers: processedReports.reduce((sum, c) => sum + (c.totalActiveMinutes || 0), 0),
        dateRange: { startDate, endDate }
      }
    });

  } catch (error) {
    console.error('Error fetching detailed cashier reports:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch detailed cashier reports',
      error: error.message
    });
  }
};

// Fixed version of getCashierPerformanceSummary
const getCashierPerformanceSummary = async (req, res) => {
  try {
    const { date } = req.query;
    
    const targetDate = date || new Date().toISOString().split('T')[0];

    const summary = await CashierDailySession.aggregate([
      {
        $match: {
          sessionDate: targetDate
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'cashierId',
          foreignField: '_id',
          as: 'cashierInfo'
        }
      },
      {
        $lookup: {
          from: 'orders',
          let: { 
            cashierId: '$cashierId',
            sessionDate: '$sessionDate'
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$cashierId', '$$cashierId'] },
                    { 
                      $gte: [
                        '$date', 
                        { $dateFromString: { dateString: { $concat: ['$$sessionDate', 'T00:00:00.000Z'] } } }
                      ] 
                    },
                    { 
                      $lt: [
                        '$date', 
                        { $dateFromString: { dateString: { $concat: ['$$sessionDate', 'T23:59:59.999Z'] } } }
                      ] 
                    }
                  ]
                }
              }
            }
          ],
          as: 'orders'
        }
      },
      {
        $group: {
          _id: null,
          totalCashiers: { $addToSet: '$cashierId' },
          activeSessions: { 
            $sum: { $cond: [{ $eq: ['$currentlyActive', true] }, 1, 0] }
          },
          totalSales: {
            $sum: {
              $sum: {
                $map: {
                  input: '$orders',
                  as: 'order',
                  in: { $ifNull: ['$$order.totalPrice', 0] }
                }
              }
            }
          },
          totalTransactions: {
            $sum: { $size: '$orders' }
          },
          topPerformers: {
            $push: {
              cashierId: '$cashierId',
              cashierName: { $arrayElemAt: ['$cashierInfo.username', 0] },
              sales: {
                $sum: {
                  $map: {
                    input: '$orders',
                    as: 'order',
                    in: { $ifNull: ['$$order.totalPrice', 0] }
                  }
                }
              }
            }
          }
        }
      },
      {
        $addFields: {
          totalCashiers: { $size: '$totalCashiers' },
          topPerformer: {
            $let: {
              vars: {
                sorted: {
                  $slice: [
                    {
                      $sortArray: {
                        input: '$topPerformers',
                        sortBy: { sales: -1 }
                      }
                    },
                    1
                  ]
                }
              },
              in: { $arrayElemAt: ['$$sorted.cashierName', 0] }
            }
          }
        }
      }
    ]);

    const result = summary[0] || {
      totalCashiers: 0,
      activeSessions: 0,
      totalSales: 0,
      totalTransactions: 0,
      topPerformer: 'N/A'
    };

    res.json({
      success: true,
      data: {
        totalCashiers: result.totalCashiers,
        activeSessions: result.activeSessions,
        todayTotalSales: parseFloat((result.totalSales || 0).toFixed(2)),
        todayTransactions: result.totalTransactions,
        topPerformer: result.topPerformer || 'N/A'
      }
    });

  } catch (error) {
    console.error('Error fetching cashier performance summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch performance summary',
      error: error.message
    });
  }
};

// Fixed version of exportCashierData
const exportCashierData = async (req, res) => {
  try {
    const { date, format = 'csv', cashierIds } = req.query;
    
    if (!date) {
      return res.status(400).json({ 
        success: false, 
        message: 'Date parameter is required' 
      });
    }
    
    // Parse cashier IDs if provided
    const selectedCashierIds = cashierIds ? 
      cashierIds.split(',').map(id => new mongoose.Types.ObjectId(id)) : null;
    
    let startDate, endDate;
    if (date.includes('_')) {
      const [start, end] = date.split('_');
      startDate = start;
      endDate = end;
    } else {
      startDate = date;
      endDate = date;
    }

    // Build match criteria
    const matchCriteria = {
      sessionDate: {
        $gte: startDate,
        $lte: endDate
      }
    };

    if (selectedCashierIds) {
      matchCriteria.cashierId = { $in: selectedCashierIds };
    }

    // Use the same aggregation pattern as the fixed detailed reports
    const exportData = await CashierDailySession.aggregate([
      { $match: matchCriteria },
      {
        $lookup: {
          from: 'users',
          localField: 'cashierId',
          foreignField: '_id',
          as: 'cashierInfo'
        }
      },
      {
        $unwind: '$cashierInfo'
      },
      {
        $lookup: {
          from: 'orders',
          let: { 
            cashierId: '$cashierId',
            sessionDate: '$sessionDate'
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$cashierId', '$$cashierId'] },
                    { 
                      $gte: [
                        '$date', 
                        { $dateFromString: { dateString: { $concat: ['$$sessionDate', 'T00:00:00.000Z'] } } }
                      ] 
                    },
                    { 
                      $lt: [
                        '$date', 
                        { $dateFromString: { dateString: { $concat: ['$$sessionDate', 'T23:59:59.999Z'] } } }
                      ] 
                    }
                  ]
                }
              }
            }
          ],
          as: 'orders'
        }
      },
      {
        $group: {
          _id: '$cashierId',
          cashierName: { $first: '$cashierInfo.username' },
          email: { $first: '$cashierInfo.email' },
          sessionCount: { $sum: { $size: { $ifNull: ['$sessions', []] } } },
          totalActiveMinutes: {
            $sum: {
              $sum: {
                $map: {
                  input: { $ifNull: ['$sessions', []] },
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
                      60000
                    ]
                  }
                }
              }
            }
          },
          totalSales: {
            $sum: {
              $sum: {
                $map: {
                  input: '$orders',
                  as: 'order',
                  in: { $ifNull: ['$$order.totalPrice', 0] }
                }
              }
            }
          },
          totalTransactions: {
            $sum: { $size: '$orders' }
          },
          firstCheckIn: {
            $min: {
              $min: {
                $map: {
                  input: { $ifNull: ['$sessions', []] },
                  as: 'session',
                  in: '$$session.checkInTime'
                }
              }
            }
          },
          lastCheckOut: {
            $max: {
              $max: {
                $map: {
                  input: { $ifNull: ['$sessions', []] },
                  as: 'session',
                  in: '$$session.checkOutTime'
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

    if (format === 'csv') {
      // Generate CSV
      const csvHeaders = [
        'Cashier Name',
        'Email',
        'Total Sales',
        'Total Transactions',
        'Session Count',
        'Total Active Time (minutes)',
        'Average Session Duration (minutes)',
        'First Check In',
        'Last Check Out'
      ];

      const csvRows = exportData.map(cashier => [
        cashier.cashierName,
        cashier.email || '',
        (cashier.totalSales || 0).toFixed(2),
        cashier.totalTransactions || 0,
        cashier.sessionCount || 0,
        Math.round(cashier.totalActiveMinutes || 0),
        Math.round((cashier.totalActiveMinutes || 0) / Math.max(cashier.sessionCount || 1, 1)),
        cashier.firstCheckIn ? new Date(cashier.firstCheckIn).toLocaleString() : '',
        cashier.lastCheckOut ? new Date(cashier.lastCheckOut).toLocaleString() : ''
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="cashier-reports-${date}.csv"`);
      res.send(csvContent);
    } else {
      // Return JSON
      res.json({
        success: true,
        data: exportData,
        exportedAt: new Date().toISOString(),
        dateRange: { startDate, endDate }
      });
    }

  } catch (error) {
    console.error('Error exporting cashier data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export cashier data',
      error: error.message
    });
  }
};


// cashier stats





module.exports = {
  getDashboardStats,
  getCashierMonitoringData,
  getActiveCashiers,
  forceStopScreenShare,
  getCashierAnalytics,
  getCashierSessions,
  getCashierDetails,
  getCashierStats,
  getCashierStatsBYid,
  getSalesTrends,
  getHourlyPerformance,
  getCashierRankings, 
  exportCashierData,
  getCashierPerformanceSummary,
  getDetailedCashierReports
};