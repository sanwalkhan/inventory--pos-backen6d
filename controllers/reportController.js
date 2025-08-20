const { Order } = require("../models/orderModel");

// Helper function to get start of day with offset
const getStartOfDay = (date, offsetDays = 0) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
};

// Helper function to get start of week (Monday)
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper function to get start of month
const getStartOfMonth = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper function to get start of year
const getStartOfYear = (date) => {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper function to get end of day
const getEndOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

// Helper function to get ISO week number
const getISOWeek = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
};

const getSalesSummary = async (req, res) => {
  try {
    const now = new Date();
    const endToday = getEndOfDay(now);

    // Define date ranges
    const startToday = getStartOfDay(now);
    const start7Days = getStartOfDay(now, 6); // Last 7 days including today
    const start30Days = getStartOfDay(now, 29); // Last 30 days including today
    const start365Days = getStartOfDay(now, 364); // Last 365 days including today

    // Aggregate metrics for a given range
    async function aggregateMetrics(fromDate, toDate) {
      const result = await Order.aggregate([
        { $match: { date: { $gte: fromDate, $lte: toDate } } },
        {
          $facet: {
            totalSales: [{ $group: { _id: null, total: { $sum: "$totalPrice" } } }],
            transactions: [{ $count: "count" }],
            itemsSold: [
              { $unwind: "$items" },
              { $group: { _id: null, totalItems: { $sum: "$items.quantity" } } },
            ],
          },
        },
      ]);
      const totalSales = result[0].totalSales[0]?.total || 0;
      const transactions = result[0].transactions[0]?.count || 0;
      const itemsSold = result[0].itemsSold[0]?.totalItems || 0;
      const avgSale = transactions > 0 ? totalSales / transactions : 0;
      return { totalSales, transactions, avgSale, itemsSold };
    }

    // 1. Daily sales trend (last 7 days)
    const dailyTrend = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = getStartOfDay(now, i);
      const dayEnd = getEndOfDay(dayStart);
      const result = await Order.aggregate([
        { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
        { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } }
      ]);
      dailyTrend.push(result[0]?.totalSales || 0);
    }

    // 2. Weekly sales trend (last 12 weeks)
    const weeklyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7);
      const weekStartMonday = getStartOfWeek(weekStart);
      const weekEnd = new Date(weekStartMonday);
      weekEnd.setDate(weekEnd.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      const result = await Order.aggregate([
        { $match: { date: { $gte: weekStartMonday, $lte: weekEnd } } },
        { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } }
      ]);
      weeklyTrend.push(result[0]?.totalSales || 0);
    }

    // 3. Monthly sales trend (last 12 months)
    const monthlyTrend = [];
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      monthEnd.setHours(23, 59, 59, 999);
      
      const result = await Order.aggregate([
        { $match: { date: { $gte: monthStart, $lte: monthEnd } } },
        { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } }
      ]);
      monthlyTrend.push(result[0]?.totalSales || 0);
    }

    // 4. Yearly sales trend (last 5 years)
    const yearlyTrend = [];
    for (let i = 4; i >= 0; i--) {
      const yearStart = new Date(now.getFullYear() - i, 0, 1);
      const yearEnd = new Date(now.getFullYear() - i, 11, 31);
      yearEnd.setHours(23, 59, 59, 999);
      
      const result = await Order.aggregate([
        { $match: { date: { $gte: yearStart, $lte: yearEnd } } },
        { $group: { _id: null, totalSales: { $sum: "$totalPrice" } } }
      ]);
      yearlyTrend.push(result[0]?.totalSales || 0);
    }

    // Get aggregated metrics for different periods
    const today = await aggregateMetrics(startToday, endToday);
    const weekly = await aggregateMetrics(start7Days, endToday);
    const monthly = await aggregateMetrics(start30Days, endToday);
    const yearly = await aggregateMetrics(start365Days, endToday);

    // Current week metrics
    const currentWeekStart = getStartOfWeek(now);
    const currentWeek = await aggregateMetrics(currentWeekStart, endToday);

    // Current month metrics
    const currentMonthStart = getStartOfMonth(now);
    const currentMonth = await aggregateMetrics(currentMonthStart, endToday);

    // Current year metrics
    const currentYearStart = getStartOfYear(now);
    const currentYear = await aggregateMetrics(currentYearStart, endToday);

    // Top products sold in last 30 days (for backward compatibility)
    const topProductsAgg = await Order.aggregate([
      { $match: { date: { $gte: start30Days, $lte: endToday } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          price: { $first: "$items.price" },
          sales: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
        }
      },
      { $sort: { sales: -1 } },
      { $limit: 10 }
    ]);

    // Calculate some mock targets and previous period data for display
    const salesTargets = Math.max(monthly.totalSales * 1.1, 50000);
    const avgSalesTargets = Math.max(monthly.totalSales * 0.9, 40000);
    const prevAvgSalesTargets = avgSalesTargets * 0.85;
    const avgItemsTarget = Math.max((monthly.itemsSold / (monthly.transactions || 1)) * 1.05, 3);
    const prevAvgItemsTarget = avgItemsTarget * 0.95;

    res.json({
      // Today metrics
      todaySales: today.totalSales,
      todayTransactions: today.transactions,
      todayItemsSold: today.itemsSold,
      todayAvgSale: today.avgSale,

      // Weekly metrics (last 7 days)
      weeklySales: weekly.totalSales,
      weeklyTransactions: weekly.transactions,
      weeklyItemsSold: weekly.itemsSold,
      weeklyAvgSale: weekly.avgSale,

      // Current week metrics (Monday to now)
      currentWeekSales: currentWeek.totalSales,
      currentWeekTransactions: currentWeek.transactions,
      currentWeekItemsSold: currentWeek.itemsSold,
      currentWeekAvgSale: currentWeek.avgSale,

      // Monthly metrics (last 30 days)
      monthlySales: monthly.totalSales,
      monthlyTransactions: monthly.transactions,
      monthlyItemsSold: monthly.itemsSold,
      monthlyAvgSale: monthly.avgSale,

      // Current month metrics (1st to now)
      currentMonthSales: currentMonth.totalSales,
      currentMonthTransactions: currentMonth.transactions,
      currentMonthItemsSold: currentMonth.itemsSold,
      currentMonthAvgSale: currentMonth.avgSale,

      // Yearly metrics (last 365 days)
      yearlySales: yearly.totalSales,
      yearlyTransactions: yearly.transactions,
      yearlyItemsSold: yearly.itemsSold,
      yearlyAvgSale: yearly.avgSale,

      // Current year metrics (Jan 1st to now)
      currentYearSales: currentYear.totalSales,
      currentYearTransactions: currentYear.transactions,
      currentYearItemsSold: currentYear.itemsSold,
      currentYearAvgSale: currentYear.avgSale,

      // Sales trends
      salesTrend: {
        daily: dailyTrend,
        weekly: weeklyTrend,
        monthly: monthlyTrend,
        yearly: yearlyTrend,
      },

      // Top products (backward compatibility)
      topProducts: topProductsAgg.map(p => ({
        name: p._id,
        price: p.price,
        sales: p.sales,
        revenue: p.revenue,
      })),

      // Additional metrics for display
      salesTargets,
      avgSalesTargets,
      prevAvgSalesTargets,
      avgItemsTarget,
      prevAvgItemsTarget,
      prevAvgItemsPerSale: Math.max((monthly.itemsSold / (monthly.transactions || 1)) * 0.92, 2.5),
    });
  } catch (err) {
    console.error("Error fetching sales summary:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const getTopProductsByPeriod = async (req, res) => {
  try {
    const period = req.query.period;
    if (!period || !["daily", "weekly", "monthly", "yearly"].includes(period)) {
      return res.status(400).json({ message: "Invalid or missing period" });
    }

    const now = new Date();
    let fromDate, toDate;

    switch (period) {
      case "daily":
        // Today only
        fromDate = getStartOfDay(now);
        toDate = getEndOfDay(now);
        break;
      case "weekly":
        // Current week (Monday to now)
        fromDate = getStartOfWeek(now);
        toDate = getEndOfDay(now);
        break;
      case "monthly":
        // Current month (1st to now)
        fromDate = getStartOfMonth(now);
        toDate = getEndOfDay(now);
        break;
      case "yearly":
        // Current year (Jan 1st to now)
        fromDate = getStartOfYear(now);
        toDate = getEndOfDay(now);
        break;
      default:
        fromDate = getStartOfDay(now);
        toDate = getEndOfDay(now);
    }

    const topProducts = await Order.aggregate([
      { $match: { date: { $gte: fromDate, $lte: toDate } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          price: { $first: "$items.price" },
          sales: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
        }
      },
      { $sort: { sales: -1 } },
      { $limit: 20 } // Increased limit for better reporting
    ]);

    res.json({
      period,
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      products: topProducts.map(p => ({
        name: p._id,
        price: p.price,
        sales: p.sales,
        revenue: p.revenue,
      })),
    });
  } catch (error) {
    console.error("Error fetching top products:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// Additional helper function for getting sales by custom date range
const getSalesByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }

    const fromDate = new Date(startDate);
    const toDate = new Date(endDate);
    toDate.setHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      return res.status(400).json({ message: "Start date cannot be after end date" });
    }

    const result = await Order.aggregate([
      { $match: { date: { $gte: fromDate, $lte: toDate } } },
      {
        $facet: {
          totalSales: [{ $group: { _id: null, total: { $sum: "$totalPrice" } } }],
          transactions: [{ $count: "count" }],
          itemsSold: [
            { $unwind: "$items" },
            { $group: { _id: null, totalItems: { $sum: "$items.quantity" } } },
          ],
          dailyBreakdown: [
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                sales: { $sum: "$totalPrice" },
                transactions: { $sum: 1 }
              }
            },
            { $sort: { _id: 1 } }
          ]
        },
      },
    ]);

    const totalSales = result[0].totalSales[0]?.total || 0;
    const transactions = result[0].transactions[0]?.count || 0;
    const itemsSold = result[0].itemsSold[0]?.totalItems || 0;
    const avgSale = transactions > 0 ? totalSales / transactions : 0;
    const dailyBreakdown = result[0].dailyBreakdown || [];

    res.json({
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      summary: {
        totalSales,
        transactions,
        itemsSold,
        avgSale,
      },
      dailyBreakdown,
    });
  } catch (error) {
    console.error("Error fetching sales by date range:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = { 
  getSalesSummary, 
  getTopProductsByPeriod, 
  getSalesByDateRange 
};