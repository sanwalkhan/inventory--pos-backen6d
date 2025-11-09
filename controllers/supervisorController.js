const CashierDailySession = require("../models/cashierModel")
const Users = require("../models/userModel")
const { Order } = require("../models/orderModel")
const mongoose = require("mongoose")
const { getOrganizationId } = require("../middleware/authmiddleware")

// Helper: Get dates with proper timezone handling
const getStartOfDay = (date = new Date()) => {
  const localDate = new Date(date)
  localDate.setHours(0, 0, 0, 0)
  return localDate
}

const getEndOfDay = (date = new Date()) => {
  const localDate = new Date(date)
  localDate.setHours(23, 59, 59, 999)
  return localDate
}

// Convert date string to proper date range (handles timezone issues)
const getDateRange = (dateStr) => {
  if (!dateStr) {
    const today = new Date()
    return {
      start: getStartOfDay(today),
      end: getEndOfDay(today),
      dateString: today.toISOString().split("T")[0],
    }
  }

  // Handle date range format "2024-01-01_2024-01-07"
  if (dateStr.includes("_")) {
    const [startStr, endStr] = dateStr.split("_")
    return {
      start: getStartOfDay(new Date(startStr)),
      end: getEndOfDay(new Date(endStr)),
      dateString: dateStr,
    }
  }

  // Single date format
  const date = new Date(dateStr)
  return {
    start: getStartOfDay(date),
    end: getEndOfDay(date),
    dateString: dateStr,
  }
}

// Helper to get organization ID from request
const getRequestOrganizationId = (req) => {
  return req.organizationId || getOrganizationId(req)
}

// Get cashier sessions with FIXED date handling
const getCashierSessions = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const { date = new Date().toISOString().split("T")[0], cashierId, status, page = 1, limit = 50 } = req.query

    const skip = (page - 1) * limit

    // Use proper date range
    const dateRange = getDateRange(date)

    // Build query with proper date handling
    const query = {
      sessionDate: dateRange.dateString,
      organizationId: organizationId,
    }

    if (cashierId && cashierId !== "all") {
      query.cashierId = new mongoose.Types.ObjectId(cashierId)
    }

    console.log("🔍 Fetching cashier sessions for date:", {
      queryDate: date,
      sessionDate: dateRange.dateString,
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    })

    // Get sessions and populate cashier info
    const sessions = await CashierDailySession.find(query)
      .populate("cashierId", "username email")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(Number.parseInt(limit))

    // Get actual orders data using proper date range
    const processedSessions = await Promise.all(
      sessions.map(async (session) => {
        const ordersToday = await Order.find({
          cashierId: session.cashierId._id,
          organizationId: organizationId,
          date: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        })

        const totalSales = ordersToday.reduce((sum, order) => sum + (order.totalPrice || 0), 0)
        const totalTransactions = ordersToday.length

        // Determine current status based on sessions array
        let currentStatus = "completed"
        let checkInTime = null
        let checkOutTime = null
        let totalActiveMinutes = 0

        if (session.sessions && session.sessions.length > 0) {
          const activeSessions = session.sessions.filter((s) => s.isActive)
          if (activeSessions.length > 0) {
            currentStatus = "active"
            checkInTime = activeSessions[0].checkInTime
          } else {
            // Get the latest session
            const latestSession = session.sessions[session.sessions.length - 1]
            checkInTime = latestSession.checkInTime
            checkOutTime = latestSession.checkOutTime
          }

          // Calculate total active time from all sessions
          session.sessions.forEach((sessionEntry) => {
            const checkIn = new Date(sessionEntry.checkInTime)
            const checkOut = sessionEntry.checkOutTime ? new Date(sessionEntry.checkOutTime) : new Date()
            const durationMinutes = Math.floor((checkOut - checkIn) / (1000 * 60))
            totalActiveMinutes += durationMinutes
          })
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
          lastActivityTime: session.lastActivityTime,
          organizationId: session.organizationId,
        }
      }),
    )

    const total = await CashierDailySession.countDocuments(query)

    res.json({
      success: true,
      sessions: processedSessions,
      pagination: {
        current: Number.parseInt(page),
        total: Math.ceil(total / limit),
        totalRecords: total,
      },
      organizationId: organizationId,
      queryInfo: {
        requestedDate: date,
        usedDate: dateRange.dateString,
        timezone: process.env.TZ || "UTC",
      },
    })
  } catch (error) {
    console.error("Get cashier sessions error:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching cashier sessions",
      error: error.message,
    })
  }
}

// Get active cashiers with FIXED date handling
const getCashierStatsBYid = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const todayDateStr = new Date().toISOString().split("T")[0]
    const dateRange = getDateRange(todayDateStr)

    console.log("👥 Fetching active cashiers for:", {
      today: todayDateStr,
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    })

    // Get all sessions for today with organization isolation
    const dailySessions = await CashierDailySession.find({
      sessionDate: todayDateStr,
      organizationId: organizationId,
    }).populate("cashierId", "username email")

    const activeCashiers = []

    for (const dailySession of dailySessions) {
      // Check if cashier has any active sessions
      const hasActiveSession = dailySession.sessions && dailySession.sessions.some((session) => session.isActive)

      if (hasActiveSession) {
        // Get today's orders for this cashier with organization isolation
        const orders = await Order.find({
          cashierId: dailySession.cashierId._id,
          organizationId: organizationId,
          date: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        })

        const totalSales = orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0)
        const totalTransactions = orders.length

        // Get the current active session
        const activeSession = dailySession.sessions.find((session) => session.isActive)

        activeCashiers.push({
          _id: dailySession._id,
          cashierName: dailySession.cashierId.username,
          cashierId: dailySession.cashierId._id,
          email: dailySession.cashierId.email,
          status: "active",
          checkInTime: activeSession ? activeSession.checkInTime : null,
          checkOutTime: null,
          totalSales,
          totalTransactions,
          sessionDate: dailySession.sessionDate,
          organizationId: dailySession.organizationId,
        })
      }
    }

    res.json({
      success: true,
      sessions: activeCashiers,
      organizationId: organizationId,
      dateInfo: {
        today: todayDateStr,
        activeCashiersCount: activeCashiers.length,
      },
    })
  } catch (error) {
    console.error("Error fetching active cashier sessions:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// Enhanced dashboard statistics with FIXED date handling
const getDashboardStats = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const dateParam = req.query.date || new Date().toISOString().split("T")[0]
    const dateRange = getDateRange(dateParam)

    console.log("📊 Dashboard stats for:", {
      requested: dateParam,
      used: dateRange.dateString,
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    })

    // Total cashiers in this organization
    const totalCashiers = await Users.countDocuments({
      role: "cashier",
      organizationId: organizationId,
    })

    // Active sessions for the date with organization isolation
    const activeSessions = await CashierDailySession.aggregate([
      {
        $match: {
          sessionDate: dateRange.dateString,
          organizationId: new mongoose.Types.ObjectId(organizationId),
        },
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
                    cond: { $eq: ["$$this.isActive", true] },
                  },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $match: { hasActiveSession: true },
      },
      {
        $count: "activeCount",
      },
    ])

    const activeSessionsCount = activeSessions[0]?.activeCount || 0

    // Today's sales and transactions from Orders with organization isolation
    const orderStats = await Order.aggregate([
      {
        $match: {
          organizationId: new mongoose.Types.ObjectId(organizationId),
          date: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        },
      },
      {
        $group: {
          _id: null,
          todayTotalSales: { $sum: "$totalPrice" },
          todayTransactions: { $sum: 1 },
          totalItems: {
            $sum: {
              $sum: "$items.quantity",
            },
          },
        },
      },
    ])

    const salesData = orderStats[0] || {
      todayTotalSales: 0,
      todayTransactions: 0,
      totalItems: 0,
    }

    // Top performer based on actual orders with organization isolation
    const topPerformer = await Order.aggregate([
      {
        $match: {
          organizationId: new mongoose.Types.ObjectId(organizationId),
          date: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        },
      },
      {
        $group: {
          _id: "$cashierId",
          totalSales: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "cashier",
        },
      },
      {
        $unwind: "$cashier",
      },
      { $sort: { totalSales: -1 } },
      { $limit: 1 },
    ])

    // Average session time from daily sessions with organization isolation
    const avgSessionTime = await CashierDailySession.aggregate([
      {
        $match: {
          sessionDate: dateRange.dateString,
          organizationId: new mongoose.Types.ObjectId(organizationId),
        },
      },
      {
        $unwind: "$sessions",
      },
      {
        $match: {
          "sessions.checkOutTime": { $ne: null },
        },
      },
      {
        $project: {
          sessionDuration: {
            $divide: [
              { $subtract: ["$sessions.checkOutTime", "$sessions.checkInTime"] },
              3600000, // Convert to hours
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgTime: { $avg: "$sessionDuration" },
        },
      },
    ])

    res.json({
      success: true,
      organizationId: organizationId,
      totalCashiers,
      activeSessions: activeSessionsCount,
      todayTotalSales: salesData.todayTotalSales,
      todayTransactions: salesData.todayTransactions,
      totalItems: salesData.totalItems,
      avgSessionTime: avgSessionTime[0]?.avgTime || 0,
      topPerformer: topPerformer[0]?.cashier.username || "N/A",
      efficiencyRate: activeSessionsCount > 0 ? (salesData.todayTransactions / activeSessionsCount).toFixed(1) : 0,
      activeAlerts: 0,
      dateInfo: {
        requestedDate: dateParam,
        usedDate: dateRange.dateString,
      },
    })
  } catch (error) {
    console.error("Dashboard stats error:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching dashboard statistics",
      error: error.message,
    })
  }
}

// Enhanced cashier monitoring with FIXED date handling
const getCashierMonitoringData = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const { cashierId } = req.params
    const today = new Date().toISOString().split("T")[0]
    const dateRange = getDateRange(today)

    console.log("👀 Monitoring data for cashier:", {
      cashierId,
      today,
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    })

    // Get today's orders for this cashier with organization isolation
    const todaysOrders = await Order.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      organizationId: organizationId,
      date: {
        $gte: dateRange.start,
        $lte: dateRange.end,
      },
    }).sort({ date: -1 })

    // Calculate stats
    const todaysSales = todaysOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0)
    const transactionsCount = todaysOrders.length
    const itemsSold = todaysOrders.reduce((sum, order) => {
      return sum + order.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0)
    }, 0)

    // Get all orders for average calculation with organization isolation
    const allOrders = await Order.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      organizationId: organizationId,
    })
    const avgSale =
      allOrders.length > 0 ? allOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0) / allOrders.length : 0

    // Get recent transactions (limit to 10)
    const recentTransactions = todaysOrders.slice(0, 10)

    // Get current session info with organization isolation
    const currentSession = await CashierDailySession.findOne({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      organizationId: organizationId,
      sessionDate: today,
    })

    const cashier = await Users.findOne({
      _id: cashierId,
      organizationId: organizationId,
    }).select("username")

    // Performance metrics
    const performanceMetrics = {
      avgTransactionValue: transactionsCount > 0 ? todaysSales / transactionsCount : 0,
      itemsPerTransaction: transactionsCount > 0 ? itemsSold / transactionsCount : 0,
      salesPerHour: 0,
    }

    // Calculate sales per hour if there's an active session
    if (currentSession && currentSession.sessions) {
      const activeSession = currentSession.sessions.find((s) => s.isActive)
      if (activeSession) {
        const hoursWorked = (new Date() - new Date(activeSession.checkInTime)) / 3600000
        performanceMetrics.salesPerHour = hoursWorked > 0 ? todaysSales / hoursWorked : 0
      }
    }

    res.json({
      success: true,
      organizationId: organizationId,
      cashierName: cashier?.username || "Unknown",
      todaysSales: todaysSales.toFixed(2),
      transactionsCount,
      itemsSold,
      avgSale: avgSale.toFixed(2),
      recentTransactions,
      currentSession,
      performanceMetrics,
      lastUpdated: new Date(),
      dateInfo: {
        today,
        ordersCount: todaysOrders.length,
      },
    })
  } catch (error) {
    console.error("Error fetching cashier monitoring data:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// Send message to cashier with organization isolation
const sendMessageToCashier = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const { cashierId, message, priority = "normal" } = req.body
    const supervisorId = req.decoded.userId

    if (!cashierId || !message) {
      return res.status(400).json({
        success: false,
        message: "Cashier ID and message are required",
      })
    }

    // Verify cashier belongs to the same organization
    const cashier = await Users.findOne({
      _id: cashierId,
      organizationId: organizationId,
    })

    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: "Cashier not found in your organization",
      })
    }

    res.json({
      success: true,
      message: "Message sent successfully",
      timestamp: new Date(),
      organizationId: organizationId,
    })
  } catch (error) {
    console.error("Send message error:", error)
    res.status(500).json({
      success: false,
      message: "Error sending message",
      error: error.message,
    })
  }
}

// Get active cashiers with enhanced data and FIXED date handling
const getActiveCashiers = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const today = new Date().toISOString().split("T")[0]
    const dateRange = getDateRange(today)

    console.log("🔍 Fetching active cashiers for:", {
      today,
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    })

    // Get active sessions with organization isolation
    const activeSessions = await CashierDailySession.find({
      sessionDate: today,
      organizationId: organizationId,
    }).populate("cashierId", "username email")

    const activeSessionsFiltered = activeSessions.filter((session) => {
      return session.sessions && session.sessions.some((s) => s.isActive)
    })

    // Get today's performance for each cashier with organization isolation
    const cashierPerformance = await Promise.all(
      activeSessionsFiltered.map(async (session) => {
        const todaysOrders = await Order.find({
          cashierId: session.cashierId._id,
          organizationId: organizationId,
          date: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        })

        const todaysSales = todaysOrders.reduce((sum, order) => sum + (order.totalPrice || 0), 0)
        const transactionsCount = todaysOrders.length

        const activeSession = session.sessions.find((s) => s.isActive)

        return {
          cashierId: session.cashierId._id,
          cashierName: session.cashierId.username,
          sessionData: session,
          todaysSales,
          transactionsCount,
          checkInTime: activeSession ? activeSession.checkInTime : null,
          active: true,
          hasScreenShare: false,
          organizationId: session.organizationId,
        }
      }),
    )

    res.json({
      success: true,
      data: cashierPerformance,
      organizationId: organizationId,
      dateInfo: {
        today,
        activeCashiers: cashierPerformance.length,
      },
    })
  } catch (error) {
    console.error("Get active cashiers error:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching active cashiers",
      error: error.message,
    })
  }
}

// Force stop screen sharing with organization isolation
const forceStopScreenShare = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const { cashierId } = req.params
    const { reason } = req.body

    // Verify cashier belongs to the same organization
    const cashier = await Users.findOne({
      _id: cashierId,
      organizationId: organizationId,
    })

    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: "Cashier not found in your organization",
      })
    }

    res.json({
      success: true,
      message: "Screen sharing stopped",
      cashierId,
      reason,
      organizationId: organizationId,
    })
  } catch (error) {
    console.error("Force stop screen share error:", error)
    res.status(500).json({
      success: false,
      message: "Error stopping screen share",
      error: error.message,
    })
  }
}

// Get cashier session analytics with FIXED date handling
const getCashierAnalytics = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const { cashierId } = req.params
    const { days = 7 } = req.query

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - Number.parseInt(days))

    // Use proper date ranges
    const startRange = getStartOfDay(startDate)
    const endRange = getEndOfDay(endDate)

    console.log("📈 Analytics date range:", {
      days,
      start: startRange.toISOString(),
      end: endRange.toISOString(),
    })

    // Get session data for the period with organization isolation
    const sessions = await CashierDailySession.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      organizationId: organizationId,
      sessionDate: {
        $gte: startRange.toISOString().split("T")[0],
        $lte: endRange.toISOString().split("T")[0],
      },
    }).sort({ sessionDate: -1 })

    // Get orders data for the period with organization isolation
    const orders = await Order.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      organizationId: organizationId,
      date: {
        $gte: startRange,
        $lte: endRange,
      },
    }).sort({ date: -1 })

    // Calculate analytics
    const analytics = {
      totalSessions: sessions.reduce((sum, session) => sum + (session.sessions ? session.sessions.length : 0), 0),
      totalSales: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      totalTransactions: orders.length,
      avgSessionDuration: 0,
      peakHours: await calculatePeakHours(orders),
      dailyBreakdown: await calculateDailyBreakdown(orders, days),
      organizationId: organizationId,
    }

    // Calculate average session duration
    let totalDuration = 0
    let completedSessions = 0

    sessions.forEach((dailySession) => {
      if (dailySession.sessions) {
        dailySession.sessions.forEach((session) => {
          if (session.checkOutTime) {
            totalDuration += (new Date(session.checkOutTime) - new Date(session.checkInTime)) / 3600000
            completedSessions++
          }
        })
      }
    })

    analytics.avgSessionDuration = completedSessions > 0 ? totalDuration / completedSessions : 0

    res.json({
      success: true,
      analytics: analytics,
      dateRange: {
        start: startRange.toISOString(),
        end: endRange.toISOString(),
        days: days,
      },
    })
  } catch (error) {
    console.error("Get cashier analytics error:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching cashier analytics",
      error: error.message,
    })
  }
}

// Helper function to calculate peak hours
const calculatePeakHours = async (orders) => {
  const hourlyData = {}

  orders.forEach((order) => {
    const hour = new Date(order.date).getHours()
    if (!hourlyData[hour]) {
      hourlyData[hour] = { transactions: 0, sales: 0 }
    }
    hourlyData[hour].transactions++
    hourlyData[hour].sales += order.totalPrice || 0
  })

  return Object.entries(hourlyData)
    .map(([hour, data]) => ({ hour: Number.parseInt(hour), ...data }))
    .sort((a, b) => b.transactions - a.transactions)
}

// Helper function to calculate daily breakdown
const calculateDailyBreakdown = async (orders, days) => {
  const dailyData = {}

  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split("T")[0]
    dailyData[dateStr] = { transactions: 0, sales: 0 }
  }

  orders.forEach((order) => {
    const dateStr = new Date(order.date).toISOString().split("T")[0]
    if (dailyData[dateStr]) {
      dailyData[dateStr].transactions++
      dailyData[dateStr].sales += order.totalPrice || 0
    }
  })

  return Object.entries(dailyData)
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
}

// Get cashier performance statistics with FIXED date handling
const getCashierStats = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const dateParam = req.query.date || new Date().toISOString().split("T")[0]
    const dateRange = getDateRange(dateParam)

    console.log("📊 Cashier stats for:", {
      requested: dateParam,
      used: dateRange.dateString,
    })

    const stats = await CashierDailySession.aggregate([
      {
        $match: {
          sessionDate: dateRange.dateString,
          organizationId: new mongoose.Types.ObjectId(organizationId),
        },
      },
      {
        $lookup: {
          from: "orders",
          let: {
            cashierId: "$cashierId",
            sessionDate: "$sessionDate",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$cashierId", "$$cashierId"] },
                    { $eq: ["$organizationId", new mongoose.Types.ObjectId(organizationId)] },
                    { $gte: ["$date", dateRange.start] },
                    { $lte: ["$date", dateRange.end] },
                  ],
                },
              },
            },
          ],
          as: "orders",
        },
      },
      {
        $group: {
          _id: "$cashierId",
          cashierName: { $first: "$cashierName" },
          totalSales: {
            $sum: {
              $sum: "$orders.totalPrice",
            },
          },
          totalTransactions: {
            $sum: { $size: "$orders" },
          },
          sessions: { $push: "$ROOT" },
          isActive: {
            $max: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: { $ifNull: ["$sessions", []] },
                      cond: { $eq: ["$this.isActive", true] },
                    },
                  },
                },
                0,
              ],
            },
          },
        },
      },
      {
        $addFields: {
          workingHours: {
            $sum: {
              $map: {
                input: { $ifNull: [{ $arrayElemAt: ["$sessions.sessions", 0] }, []] },
                as: "session",
                in: {
                  $divide: [
                    {
                      $subtract: [
                        {
                          $cond: [{ $ne: ["$session.checkOutTime", null] }, "$session.checkOutTime", new Date()],
                        },
                        "$session.checkInTime",
                      ],
                    },
                    3600000,
                  ],
                },
              },
            },
          },
        },
      },
      {
        $sort: { totalSales: -1 },
      },
    ])

    res.json({
      success: true,
      data: stats,
      organizationId: organizationId,
      dateInfo: {
        requestedDate: dateParam,
        usedDate: dateRange.dateString,
      },
    })
  } catch (error) {
    console.error("Get cashier stats error:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching cashier statistics",
      error: error.message,
    })
  }
}

// Get detailed cashier performance with FIXED date handling
const getCashierDetails = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const { cashierId } = req.params
    const {
      startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      endDate = new Date().toISOString().split("T")[0],
    } = req.query

    // Use proper date ranges
    const startRange = getStartOfDay(new Date(startDate))
    const endRange = getEndOfDay(new Date(endDate))

    console.log("🔍 Cashier details date range:", {
      start: startRange.toISOString(),
      end: endRange.toISOString(),
    })

    // Get cashier info with organization isolation
    const cashier = await Users.findOne({
      _id: cashierId,
      organizationId: organizationId,
    }).select("username email")

    if (!cashier) {
      return res.status(404).json({
        success: false,
        message: "Cashier not found in your organization",
      })
    }

    // Get sessions in date range with organization isolation
    const sessions = await CashierDailySession.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      organizationId: organizationId,
      sessionDate: {
        $gte: startRange.toISOString().split("T")[0],
        $lte: endRange.toISOString().split("T")[0],
      },
    }).sort({ sessionDate: -1 })

    // Get orders for summary with organization isolation
    const orders = await Order.find({
      cashierId: new mongoose.Types.ObjectId(cashierId),
      organizationId: organizationId,
      date: {
        $gte: startRange,
        $lte: endRange,
      },
    })

    const summary = {
      totalSales: orders.reduce((sum, order) => sum + (order.totalPrice || 0), 0),
      totalTransactions: orders.length,
      totalSessions: sessions.reduce((sum, session) => sum + (session.sessions ? session.sessions.length : 0), 0),
      avgSalesPerSession: 0,
      avgTransactionsPerSession: 0,
      organizationId: organizationId,
    }

    const totalSessions = summary.totalSessions
    if (totalSessions > 0) {
      summary.avgSalesPerSession = summary.totalSales / totalSessions
      summary.avgTransactionsPerSession = summary.totalTransactions / totalSessions
    }

    res.json({
      success: true,
      cashier,
      sessions,
      summary,
      dateRange: {
        start: startRange.toISOString(),
        end: endRange.toISOString(),
      },
    })
  } catch (error) {
    console.error("Get cashier details error:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching cashier details",
      error: error.message,
    })
  }
}

// Sales trends with FIXED date handling
const getSalesTrends = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const days = Number.parseInt(req.query.days) || 7
    const cashierId = req.query.cashierId

    const endDate = getEndOfDay()
    const startDate = getStartOfDay()
    startDate.setDate(startDate.getDate() - days + 1)

    console.log("📈 Sales trends date range:", {
      days,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    })

    const match = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      date: { $gte: startDate, $lte: endDate },
    }
    if (cashierId && mongoose.Types.ObjectId.isValid(cashierId)) {
      match.cashierId = new mongoose.Types.ObjectId(cashierId)
    }

    const trends = await Order.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          totalSales: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    // Fill missing dates with zeroes
    const results = []
    for (let i = 0; i < days; i++) {
      const date = new Date(startDate)
      date.setDate(startDate.getDate() + i)
      const dateStr = date.toISOString().split("T")[0]
      const dayData = trends.find((t) => t._id === dateStr)
      results.push({
        _id: dateStr,
        totalSales: dayData ? dayData.totalSales : 0,
        totalTransactions: dayData ? dayData.totalTransactions : 0,
      })
    }

    res.json({
      success: true,
      data: results,
      organizationId: organizationId,
      dateRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        days: days,
      },
    })
  } catch (error) {
    console.error("getSalesTrends error:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching sales trends",
      error: error.message,
    })
  }
}

// Hourly performance with FIXED date handling
const getHourlyPerformance = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const dateStr = req.query.date
    if (!dateStr) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required",
      })
    }

    const dateRange = getDateRange(dateStr)

    console.log("🕒 Hourly performance for:", {
      date: dateStr,
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    })

    // Use timezone-aware aggregation
    const hourlyOrders = await Order.aggregate([
      {
        $match: {
          organizationId: new mongoose.Types.ObjectId(organizationId),
          date: { $gte: dateRange.start, $lt: dateRange.end },
        },
      },
      {
        $group: {
          _id: {
            $hour: {
              date: "$date",
              timezone: process.env.TZ || "Asia/Karachi",
            },
          },
          totalSales: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])

    console.log("📊 Hourly orders data:", hourlyOrders)

    // Active cashiers count per hour
    const sessions = await CashierDailySession.find({
      sessionDate: dateRange.dateString,
      organizationId: organizationId,
    })

    console.log("👥 Found sessions:", sessions.length)

    const activeCashiersByHour = {}

    sessions.forEach((dailySession) => {
      if (dailySession.sessions) {
        dailySession.sessions.forEach((session) => {
          if (session.isActive) {
            const checkInTime = new Date(session.checkInTime)
            const localHour = checkInTime.getHours()
            activeCashiersByHour[localHour] = (activeCashiersByHour[localHour] || 0) + 1
          }
        })
      }
    })

    console.log("👥 Active cashiers by local hour:", activeCashiersByHour)

    // Combine data and fill missing hours
    const results = []
    for (let h = 0; h < 24; h++) {
      const orderData = hourlyOrders.find((o) => o._id === h) || { totalSales: 0, totalTransactions: 0 }
      results.push({
        _id: h,
        totalSales: orderData.totalSales,
        totalTransactions: orderData.totalTransactions,
        activeCashiers: activeCashiersByHour[h] || 0,
      })
    }

    console.log("📈 Final hourly results:", results)

    res.json({
      success: true,
      data: results,
      organizationId: organizationId,
      timezone: process.env.TZ || "UTC",
      dateInfo: {
        requestedDate: dateStr,
        usedDate: dateRange.dateString,
      },
    })
  } catch (error) {
    console.error("❌ getHourlyPerformance error:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching hourly performance",
      error: error.message,
    })
  }
}

// Cashier rankings with FIXED date handling
const getCashierRankings = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const dateStr = req.query.date
    if (!dateStr) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required",
      })
    }

    const dateRange = getDateRange(dateStr)

    console.log("🏆 Cashier rankings for:", {
      date: dateStr,
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    })

    // Get cashier rankings based on actual orders with organization isolation
    const rankings = await Order.aggregate([
      {
        $match: {
          organizationId: new mongoose.Types.ObjectId(organizationId),
          date: {
            $gte: dateRange.start,
            $lte: dateRange.end,
          },
        },
      },
      {
        $group: {
          _id: "$cashierId",
          totalSales: { $sum: "$totalPrice" },
          totalTransactions: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "cashier",
        },
      },
      {
        $unwind: "$cashier",
      },
      {
        $lookup: {
          from: "cashierdailysessions",
          let: { cashierId: "$_id", sessionDate: dateRange.dateString },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$cashierId", "$$cashierId"] },
                    { $eq: ["$sessionDate", "$$sessionDate"] },
                    { $eq: ["$organizationId", new mongoose.Types.ObjectId(organizationId)] },
                  ],
                },
              },
            },
          ],
          as: "session",
        },
      },
      {
        $addFields: {
          cashierName: "$cashier.username",
          isActive: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: { $ifNull: [{ $arrayElemAt: ["$session.sessions", 0] }, []] },
                    cond: { $eq: ["$this.isActive", true] },
                  },
                },
              },
              0,
            ],
          },
          workingHours: {
            $sum: {
              $map: {
                input: { $ifNull: [{ $arrayElemAt: ["$session.sessions", 0] }, []] },
                as: "sess",
                in: {
                  $divide: [
                    {
                      $subtract: [{ $ifNull: ["$sess.checkOutTime", new Date()] }, "$sess.checkInTime"],
                    },
                    3600000,
                  ],
                },
              },
            },
          },
        },
      },
      { $sort: { totalSales: -1 } },
    ])

    res.json({
      success: true,
      data: rankings,
      organizationId: organizationId,
      dateInfo: {
        requestedDate: dateStr,
        usedDate: dateRange.dateString,
      },
    })
  } catch (error) {
    console.error("getCashierRankings error:", error)
    res.status(500).json({
      success: false,
      message: "Error fetching cashier rankings",
      error: error.message,
    })
  }
}

// Detailed cashier reports with FIXED date handling
const getDetailedCashierReports = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const { date } = req.query

    const dateRange = getDateRange(date)

    console.log("📋 Detailed reports for:", {
      requested: date,
      used: dateRange.dateString,
      start: dateRange.start.toISOString(),
      end: dateRange.end.toISOString(),
    })

    // Build match criteria for sessionDate with organization isolation
    const matchCriteria = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      sessionDate: {
        $gte: dateRange.dateString.split("_")[0], // Handle range format
        $lte: dateRange.dateString.includes("_") ? dateRange.dateString.split("_")[1] : dateRange.dateString,
      },
    }

    // Aggregate cashier data using existing data in CashierDailySession
    const cashierReports = await CashierDailySession.aggregate([
      {
        $match: matchCriteria,
      },
      {
        $lookup: {
          from: "users",
          localField: "cashierId",
          foreignField: "_id",
          as: "cashierInfo",
        },
      },
      {
        $unwind: "$cashierInfo",
      },
      {
        $lookup: {
          from: "orders",
          let: {
            cashierId: "$cashierId",
            sessionDate: "$sessionDate",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$cashierId", "$$cashierId"] },
                    { $eq: ["$organizationId", new mongoose.Types.ObjectId(organizationId)] },
                    {
                      $gte: [
                        "$date",
                        { $dateFromString: { dateString: { $concat: ["$$sessionDate", "T00:00:00.000Z"] } } },
                      ],
                    },
                    {
                      $lt: [
                        "$date",
                        { $dateFromString: { dateString: { $concat: ["$$sessionDate", "T23:59:59.999Z"] } } },
                      ],
                    },
                  ],
                },
              },
            },
          ],
          as: "orders",
        },
      },
      {
        $group: {
          _id: "$cashierId",
          cashierName: { $first: "$cashierInfo.username" },
          email: { $first: "$cashierInfo.email" },

          // Session metrics
          sessionCount: { $sum: { $size: { $ifNull: ["$sessions", []] } } },
          currentlyActive: { $max: "$currentlyActive" },

          // Calculate total active minutes
          totalActiveMinutes: {
            $sum: {
              $sum: {
                $map: {
                  input: { $ifNull: ["$sessions", []] },
                  as: "session",
                  in: {
                    $cond: [
                      { $ne: ["$$session.checkOutTime", null] },
                      "$$session.sessionDuration",
                      {
                        $divide: [
                          {
                            $subtract: [new Date(), "$$session.checkInTime"],
                          },
                          60000,
                        ],
                      },
                    ],
                  },
                },
              },
            },
          },

          // Use actual orders data for sales and transactions
          totalSales: {
            $sum: {
              $sum: {
                $map: {
                  input: "$orders",
                  as: "order",
                  in: { $ifNull: ["$$order.totalPrice", 0] },
                },
              },
            },
          },
          totalTransactions: {
            $sum: { $size: "$orders" },
          },

          // Collect session details
          sessionDetails: {
            $push: {
              sessionDate: "$sessionDate",
              sessions: "$sessions",
              dailySales: {
                $sum: {
                  $map: {
                    input: "$orders",
                    as: "order",
                    in: { $ifNull: ["$$order.totalPrice", 0] },
                  },
                },
              },
              dailyTransactions: { $size: "$orders" },
              totalCheckIns: "$totalCheckIns",
              totalCheckOuts: "$totalCheckOuts",
              checkoutReasonsSummary: "$checkoutReasonsSummary",
            },
          },

          // Get first and last activity
          firstCheckIn: {
            $min: {
              $min: {
                $map: {
                  input: { $ifNull: ["$sessions", []] },
                  as: "session",
                  in: "$$session.checkInTime",
                },
              },
            },
          },

          lastCheckOut: {
            $max: {
              $max: {
                $map: {
                  input: { $ifNull: ["$sessions", []] },
                  as: "session",
                  in: "$$session.checkOutTime",
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          cashierId: "$_id",
          currentStatus: {
            $cond: [{ $eq: ["$currentlyActive", true] }, "active", "completed"],
          },
          averageSessionDuration: {
            $cond: [{ $gt: ["$sessionCount", 0] }, { $divide: ["$totalActiveMinutes", "$sessionCount"] }, 0],
          },
          performanceRating: {
            $switch: {
              branches: [
                { case: { $gte: ["$totalSales", 10000] }, then: "Excellent" },
                { case: { $gte: ["$totalSales", 5000] }, then: "Good" },
                { case: { $gte: ["$totalSales", 2000] }, then: "Average" },
                { case: { $gte: ["$totalSales", 500] }, then: "Below Average" },
              ],
              default: "Poor",
            },
          },
        },
      },
      {
        $sort: { totalSales: -1 },
      },
    ])

    // Process the results
    const processedReports = cashierReports.map((cashier) => {
      // Flatten all sessions from all days for this cashier
      const allSessions = []
      cashier.sessionDetails.forEach((dayDetail) => {
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
              duration: session.sessionDuration || 0,
              salesDuringSession: session.salesDuringSession || 0,
              transactionsDuringSession: session.transactionsDuringSession || 0,
            })
          })
        }
      })

      return {
        ...cashier,
        totalActiveMinutes: Math.round(cashier.totalActiveMinutes || 0),
        averageSessionDuration: Math.round(cashier.averageSessionDuration || 0),
        totalSales: Number.parseFloat((cashier.totalSales || 0).toFixed(2)),
        averageSalePerTransaction:
          cashier.totalTransactions > 0
            ? Number.parseFloat(((cashier.totalSales || 0) / cashier.totalTransactions).toFixed(2))
            : 0,
        sessionBreakdown: allSessions,
      }
    })

    res.json({
      success: true,
      data: processedReports,
      organizationId: organizationId,
      summary: {
        totalCashiers: processedReports.length,
        activeCashiers: processedReports.filter((c) => c.currentStatus === "active").length,
        totalSalesAllCashiers: processedReports.reduce((sum, c) => sum + (c.totalSales || 0), 0),
        totalTransactionsAllCashiers: processedReports.reduce((sum, c) => sum + (c.totalTransactions || 0), 0),
        totalActiveTimeAllCashiers: processedReports.reduce((sum, c) => sum + (c.totalActiveMinutes || 0), 0),
        dateRange: {
          startDate: dateRange.dateString.split("_")[0],
          endDate: dateRange.dateString.includes("_") ? dateRange.dateString.split("_")[1] : dateRange.dateString,
        },
      },
      dateInfo: {
        requestedDate: date,
        usedDate: dateRange.dateString,
      },
    })
  } catch (error) {
    console.error("Error fetching detailed cashier reports:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch detailed cashier reports",
      error: error.message,
    })
  }
}

// Cashier performance summary with FIXED date handling
const getCashierPerformanceSummary = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const { date } = req.query

    const targetDate = date || new Date().toISOString().split("T")[0]
    const dateRange = getDateRange(targetDate)

    console.log("📈 Performance summary for:", {
      requested: date,
      used: dateRange.dateString,
    })

    const summary = await CashierDailySession.aggregate([
      {
        $match: {
          sessionDate: dateRange.dateString,
          organizationId: new mongoose.Types.ObjectId(organizationId),
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "cashierId",
          foreignField: "_id",
          as: "cashierInfo",
        },
      },
      {
        $lookup: {
          from: "orders",
          let: {
            cashierId: "$cashierId",
            sessionDate: "$sessionDate",
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$cashierId", "$$cashierId"] },
                    { $eq: ["$organizationId", new mongoose.Types.ObjectId(organizationId)] },
                    { $gte: ["$date", dateRange.start] },
                    { $lte: ["$date", dateRange.end] },
                  ],
                },
              },
            },
          ],
          as: "orders",
        },
      },
      {
        $group: {
          _id: null,
          totalCashiers: { $addToSet: "$cashierId" },
          activeSessions: {
            $sum: { $cond: [{ $eq: ["$currentlyActive", true] }, 1, 0] },
          },
          totalSales: {
            $sum: {
              $sum: {
                $map: {
                  input: "$orders",
                  as: "order",
                  in: { $ifNull: ["$$order.totalPrice", 0] },
                },
              },
            },
          },
          totalTransactions: {
            $sum: { $size: "$orders" },
          },
          topPerformers: {
            $push: {
              cashierId: "$cashierId",
              cashierName: { $arrayElemAt: ["$cashierInfo.username", 0] },
              sales: {
                $sum: {
                  $map: {
                    input: "$orders",
                    as: "order",
                    in: { $ifNull: ["$$order.totalPrice", 0] },
                  },
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          totalCashiers: { $size: "$totalCashiers" },
          topPerformer: {
            $let: {
              vars: {
                sorted: {
                  $slice: [
                    {
                      $sortArray: {
                        input: "$topPerformers",
                        sortBy: { sales: -1 },
                      },
                    },
                    1,
                  ],
                },
              },
              in: { $arrayElemAt: ["$$sorted.cashierName", 0] },
            },
          },
        },
      },
    ])

    const result = summary[0] || {
      totalCashiers: 0,
      activeSessions: 0,
      totalSales: 0,
      totalTransactions: 0,
      topPerformer: "N/A",
    }

    res.json({
      success: true,
      organizationId: organizationId,
      data: {
        totalCashiers: result.totalCashiers,
        activeSessions: result.activeSessions,
        todayTotalSales: Number.parseFloat((result.totalSales || 0).toFixed(2)),
        todayTransactions: result.totalTransactions,
        topPerformer: result.topPerformer || "N/A",
      },
      dateInfo: {
        requestedDate: date,
        usedDate: dateRange.dateString,
      },
    })
  } catch (error) {
    console.error("Error fetching cashier performance summary:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch performance summary",
      error: error.message,
    })
  }
}

// Export cashier data with FIXED date handling
const exportCashierData = async (req, res) => {
  try {
    const organizationId = getRequestOrganizationId(req)

    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    const { date, format = "csv", exportType = "summary", cashierIds } = req.query

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required",
      })
    }

    const dateRange = getDateRange(date)

    console.log("Export initiated:", {
      date,
      format,
      exportType,
      used: dateRange.dateString,
    })

    // Parse cashier IDs if provided
    const selectedCashierIds = cashierIds ? cashierIds.split(",").map((id) => new mongoose.Types.ObjectId(id)) : null

    // Build match criteria with organization isolation
    const matchCriteria = {
      organizationId: new mongoose.Types.ObjectId(organizationId),
      sessionDate: {
        $gte: dateRange.dateString.split("_")[0],
        $lte: dateRange.dateString.includes("_") ? dateRange.dateString.split("_")[1] : dateRange.dateString,
      },
    }

    if (selectedCashierIds) {
      matchCriteria.cashierId = { $in: selectedCashierIds }
    }

    // For detailed session export
    if (exportType === "detailed") {
      const detailedSessions = await CashierDailySession.find(matchCriteria)
        .populate("cashierId", "username email")
        .sort({ sessionDate: -1, createdAt: -1 })
        .lean()

      if (format === "csv") {
        // Generate detailed CSV with each session as a row
        const csvHeaders = [
          "Session Date",
          "Cashier Name",
          "Cashier Email",
          "Check In Time",
          "Check Out Time",
          "Session Duration (minutes)",
          "Sales During Session",
          "Transactions During Session",
          "Checkout Reason",
          "Screen Share Enabled",
          "Session Status",
        ]

        const csvRows = []

        detailedSessions.forEach((dailySession) => {
          dailySession.sessions.forEach((session) => {
            csvRows.push([
              dailySession.sessionDate,
              dailySession.cashierInfo?.username || dailySession.cashierName,
              dailySession.cashierInfo?.email || "",
              session.checkInTime
                ? new Date(session.checkInTime).toLocaleString("en-US", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                  })
                : "N/A",
              session.checkOutTime
                ? new Date(session.checkOutTime).toLocaleString("en-US", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: true,
                  })
                : "Active",
              Math.round(session.sessionDuration || 0),
              session.salesDuringSession || 0,
              session.transactionsDuringSession || 0,
              session.checkoutReason || "N/A",
              session.screenShareEnabled ? "Yes" : "No",
              session.isActive ? "Active" : "Completed",
            ])
          })
        })

        const csvContent = [csvHeaders, ...csvRows]
          .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
          .join("\n")

        res.setHeader("Content-Type", "text/csv; charset=utf-8")
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="cashier-sessions-detailed-${dateRange.dateString}-${new Date().getTime()}.csv"`,
        )
        res.send("\uFEFF" + csvContent) // UTF-8 BOM for Excel compatibility
      } else {
        // Return JSON with detailed sessions
        const formattedData = detailedSessions.map((dailySession) => ({
          sessionDate: dailySession.sessionDate,
          cashierName: dailySession.cashierName,
          cashierEmail: dailySession.cashierInfo?.email || "",
          sessions: dailySession.sessions.map((session) => ({
            checkInTime: session.checkInTime,
            checkOutTime: session.checkOutTime,
            sessionDurationMinutes: Math.round(session.sessionDuration || 0),
            salesDuringSession: session.salesDuringSession || 0,
            transactionsDuringSession: session.transactionsDuringSession || 0,
            checkoutReason: session.checkoutReason || "N/A",
            screenShareEnabled: session.screenShareEnabled,
            status: session.isActive ? "Active" : "Completed",
          })),
        }))

        res.json({
          success: true,
          data: formattedData,
          exportedAt: new Date().toISOString(),
          organizationId: organizationId,
          dateRange: {
            startDate: dateRange.dateString.split("_")[0],
            endDate: dateRange.dateString.includes("_") ? dateRange.dateString.split("_")[1] : dateRange.dateString,
          },
        })
      }
    } else {
      // Original summary export
      const exportData = await CashierDailySession.aggregate([
        { $match: matchCriteria },
        {
          $lookup: {
            from: "users",
            localField: "cashierId",
            foreignField: "_id",
            as: "cashierInfo",
          },
        },
        {
          $unwind: "$cashierInfo",
        },
        {
          $lookup: {
            from: "orders",
            let: {
              cashierId: "$cashierId",
              sessionDate: "$sessionDate",
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      { $eq: ["$cashierId", "$$cashierId"] },
                      { $eq: ["$organizationId", new mongoose.Types.ObjectId(organizationId)] },
                      { $gte: ["$date", dateRange.start] },
                      { $lte: ["$date", dateRange.end] },
                    ],
                  },
                },
              },
            ],
            as: "orders",
          },
        },
        {
          $group: {
            _id: "$cashierId",
            cashierName: { $first: "$cashierInfo.username" },
            email: { $first: "$cashierInfo.email" },
            sessionCount: { $sum: { $size: { $ifNull: ["$sessions", []] } } },
            totalActiveMinutes: {
              $sum: {
                $sum: {
                  $map: {
                    input: { $ifNull: ["$sessions", []] },
                    as: "session",
                    in: {
                      $divide: [
                        {
                          $subtract: [
                            {
                              $cond: [{ $ne: ["$$session.checkOutTime", null] }, "$$session.checkOutTime", new Date()],
                            },
                            "$$session.checkInTime",
                          ],
                        },
                        60000,
                      ],
                    },
                  },
                },
              },
            },
            totalSales: {
              $sum: {
                $sum: {
                  $map: {
                    input: "$orders",
                    as: "order",
                    in: { $ifNull: ["$$order.totalPrice", 0] },
                  },
                },
              },
            },
            totalTransactions: {
              $sum: { $size: "$orders" },
            },
            firstCheckIn: {
              $min: {
                $min: {
                  $map: {
                    input: { $ifNull: ["$sessions", []] },
                    as: "session",
                    in: "$$session.checkInTime",
                  },
                },
              },
            },
            lastCheckOut: {
              $max: {
                $max: {
                  $map: {
                    input: { $ifNull: ["$sessions", []] },
                    as: "session",
                    in: "$$session.checkOutTime",
                  },
                },
              },
            },
          },
        },
        {
          $sort: { totalSales: -1 },
        },
      ])

      if (format === "csv") {
        // Generate CSV with consistent date formatting
        const csvHeaders = [
          "Cashier Name",
          "Email",
          "Total Sales",
          "Total Transactions",
          "Session Count",
          "Total Active Time (minutes)",
          "Average Session Duration (minutes)",
          "First Check In",
          "Last Check Out",
        ]

        const csvRows = exportData.map((cashier) => [
          cashier.cashierName,
          cashier.email || "",
          (cashier.totalSales || 0).toFixed(2),
          cashier.totalTransactions || 0,
          cashier.sessionCount || 0,
          Math.round(cashier.totalActiveMinutes || 0),
          Math.round((cashier.totalActiveMinutes || 0) / Math.max(cashier.sessionCount || 1, 1)),
          cashier.firstCheckIn
            ? new Date(cashier.firstCheckIn).toLocaleString("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              })
            : "",
          cashier.lastCheckOut
            ? new Date(cashier.lastCheckOut).toLocaleString("en-US", {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: true,
              })
            : "",
        ])

        const csvContent = [csvHeaders, ...csvRows]
          .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
          .join("\n")

        res.setHeader("Content-Type", "text/csv; charset=utf-8")
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="cashier-reports-${dateRange.dateString}-${new Date().getTime()}.csv"`,
        )
        res.send("\uFEFF" + csvContent) // UTF-8 BOM for Excel compatibility
      } else {
        // Return JSON
        res.json({
          success: true,
          data: exportData,
          exportedAt: new Date().toISOString(),
          organizationId: organizationId,
          dateRange: {
            startDate: dateRange.dateString.split("_")[0],
            endDate: dateRange.dateString.includes("_") ? dateRange.dateString.split("_")[1] : dateRange.dateString,
          },
        })
      }
    }
  } catch (error) {
    console.error("Error exporting cashier data:", error)
    res.status(500).json({
      success: false,
      message: "Failed to export cashier data",
      error: error.message,
    })
  }
}

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
  getDetailedCashierReports,
}
