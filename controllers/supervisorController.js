const CashierSession = require('../models/cashierModel');
const Users = require('../models/userModel');
const getAllCashier= async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    
    // Get total unique cashiers for the date
    const totalCashiers = await Users.find({role:"cashier"}).countDocuments();
    
    // Get active sessions count
    const activeSessions = await CashierSession.countDocuments({
      sessionDate: date,
      status: 'active'
    });
    
    // Get today's total sales and transactions
    const salesStats = await CashierSession.aggregate([
      {
        $match: {
          sessionDate: date
        }
      },
      {
        $group: {
          _id: null,
          todayTotalSales: { $sum: '$totalSales' },
          todayTransactions: { $sum: '$totalTransactions' },
          activeCashiers: { $addToSet: '$cashierId' }
        }
      },
      {
        $addFields: {
          activeCashiersCount: { $size: '$activeCashiers' }
          
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json(salesStats[0] || { todayTotalSales: 0, todayTransactions: 0, activeCashiersCount: 0 });
  } catch (error) {
    console.error('Get all cashier error:', error);
    res.status(500).json({ 
      message: 'Error fetching all cashier statistics',
      error: error.message 
    });
  }
};

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    
    // Get total unique cashiers for the date
    const totalCashiers = await CashierSession.distinct('cashierId', {
      sessionDate: date
    }).countDocuments();
    
    // Get active sessions count
    const activeSessions = await CashierSession.countDocuments({
      sessionDate: date,
      status: 'active'
    });
    
    // Get today's total sales and transactions
    const salesStats = await CashierSession.aggregate([
      {
        $match: {
          sessionDate: date
        }
      },
      {
        $group: {
          _id: null,
          todayTotalSales: { $sum: '$totalSales' },
          todayTransactions: { $sum: '$totalTransactions' }
        }
      }
    ]);
    
    const stats = salesStats[0] || { todayTotalSales: 0, todayTransactions: 0 };
    
    res.json({
      totalCashiers,
      activeSessions,
      todayTotalSales: stats.todayTotalSales,
      todayTransactions: stats.todayTransactions
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ 
      message: 'Error fetching dashboard statistics',
      error: error.message 
    });
  }
};

// Get all cashier sessions with optional filters
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

// Force checkout a cashier session
const forceCheckout = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { reason } = req.body;
    
    const session = await CashierSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({ message: 'Session not found' });
    }
    
    if (session.status !== 'active') {
      return res.status(400).json({ message: 'Session is not active' });
    }
    
    // Update session
    session.checkOutTime = new Date();
    session.status = 'completed';
    
    // Add force checkout note if reason provided
    if (reason) {
      session.notes = `Force checkout by supervisor: ${reason}`;
    }
    
    await session.save();
    
    res.json({
      message: 'Cashier session forcefully checked out',
      session
    });
  } catch (error) {
    console.error('Force checkout error:', error);
    res.status(500).json({ 
      message: 'Error forcing checkout',
      error: error.message 
    });
  }
};

// Get sales trends over time
const getSalesTrends = async (req, res) => {
  try {
    const { 
      days = 7,
      cashierId 
    } = req.query;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));
    const endDate = new Date();
    
    const matchQuery = {
      sessionDate: {
        $gte: startDate.toISOString().split('T')[0],
        $lte: endDate.toISOString().split('T')[0]
      }
    };
    
    if (cashierId && cashierId !== 'all') {
      matchQuery.cashierId = new mongoose.Types.ObjectId(cashierId);
    }
    
    const trends = await CashierSession.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: '$sessionDate',
          totalSales: { $sum: '$totalSales' },
          totalTransactions: { $sum: '$totalTransactions' },
          activeCashiers: { $addToSet: '$cashierId' }
        }
      },
      {
        $addFields: {
          activeCashiersCount: { $size: '$activeCashiers' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json(trends);
  } catch (error) {
    console.error('Get sales trends error:', error);
    res.status(500).json({ 
      message: 'Error fetching sales trends',
      error: error.message 
    });
  }
};

// Get hourly performance data
const getHourlyPerformance = async (req, res) => {
  try {
    const { date = new Date().toISOString().split('T')[0] } = req.query;
    
    const performance = await CashierSession.aggregate([
      {
        $match: {
          sessionDate: date
        }
      },
      {
        $project: {
          cashierName: 1,
          totalSales: 1,
          totalTransactions: 1,
          checkInHour: { $hour: '$checkInTime' },
          workingHours: {
            $divide: [
              {
                $subtract: [
                  {
                    $cond: [
                      { $ne: ['$checkOutTime', null] },
                      '$checkOutTime',
                      new Date()
                    ]
                  },
                  '$checkInTime'
                ]
              },
              3600000
            ]
          }
        }
      },
      {
        $group: {
          _id: '$checkInHour',
          totalSales: { $sum: '$totalSales' },
          totalTransactions: { $sum: '$totalTransactions' },
          activeCashiers: { $sum: 1 },
          avgWorkingHours: { $avg: '$workingHours' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    res.json(performance);
  } catch (error) {
    console.error('Get hourly performance error:', error);
    res.status(500).json({ 
      message: 'Error fetching hourly performance',
      error: error.message 
    });
  }
};

// Export all cashier data for reporting
const exportCashierData = async (req, res) => {
  try {
    const { 
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate = new Date().toISOString().split('T')[0],
      format = 'json'
    } = req.query;
    
    const data = await CashierSession.find({
      sessionDate: {
        $gte: startDate,
        $lte: endDate
      }
    })
    .populate('cashierId', 'name email')
    .sort({ sessionDate: -1, checkInTime: -1 });
    
    if (format === 'csv') {
      // Convert to CSV format
      const csvHeader = 'Date,Cashier Name,Check In,Check Out,Duration (hours),Sales,Transactions,Status\n';
      const csvData = data.map(session => {
        const duration = session.checkOutTime 
          ? ((new Date(session.checkOutTime) - new Date(session.checkInTime)) / 3600000).toFixed(2)
          : 'N/A';
        
        return [
          session.sessionDate,
          session.cashierName,
          new Date(session.checkInTime).toLocaleString(),
          session.checkOutTime ? new Date(session.checkOutTime).toLocaleString() : 'N/A',
          duration,
          session.totalSales,
          session.totalTransactions,
          session.status
        ].join(',');
      }).join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=cashier-data.csv');
      res.send(csvHeader + csvData);
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error('Export cashier data error:', error);
    res.status(500).json({ 
      message: 'Error exporting cashier data',
      error: error.message 
    });
  }
};

module.exports = {
  getDashboardStats,
  getCashierSessions,
  getCashierStats,
  getCashierDetails,
  forceCheckout,
  getSalesTrends,
  getHourlyPerformance,
  exportCashierData
};