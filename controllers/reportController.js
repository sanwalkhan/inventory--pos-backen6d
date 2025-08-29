const { Order } = require("../models/orderModel");
const { Products } = require("../models/productModel");

// Helper functions
const getStartOfDay = (date, offsetDays = 0) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
};
const getEndOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};
const getStartOfWeek = (date) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
};
const getStartOfMonth = (date) => {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
};
const getStartOfYear = (date) => {
  const d = new Date(date);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d;
};

const getSalesSummary = async (req, res) => {
  try {
    const now = new Date();
    const endToday = getEndOfDay(now);

    const startToday = getStartOfDay(now);
    const start7Days = getStartOfDay(now, 6);
    const start30Days = getStartOfDay(now, 29);
    const start365Days = getStartOfDay(now, 364);

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

    const today = await aggregateMetrics(startToday, endToday);
    const weekly = await aggregateMetrics(start7Days, endToday);
    const monthly = await aggregateMetrics(start30Days, endToday);
    const yearly = await aggregateMetrics(start365Days, endToday);

    const currentWeekStart = getStartOfWeek(now);
    const currentWeek = await aggregateMetrics(currentWeekStart, endToday);

    const currentMonthStart = getStartOfMonth(now);
    const currentMonth = await aggregateMetrics(currentMonthStart, endToday);

    const currentYearStart = getStartOfYear(now);
    const currentYear = await aggregateMetrics(currentYearStart, endToday);

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

    const salesTargets = Math.max(monthly.totalSales * 1.1, 50000);
    const avgSalesTargets = Math.max(monthly.totalSales * 0.9, 40000);
    const prevAvgSalesTargets = avgSalesTargets * 0.85;
    const avgItemsTarget = Math.max((monthly.itemsSold / (monthly.transactions || 1)) * 1.05, 3);
    const prevAvgItemsTarget = avgItemsTarget * 0.95;

    res.json({
      todaySales: today.totalSales,
      todayTransactions: today.transactions,
      todayItemsSold: today.itemsSold,
      todayAvgSale: today.avgSale,

      weeklySales: weekly.totalSales,
      weeklyTransactions: weekly.transactions,
      weeklyItemsSold: weekly.itemsSold,
      weeklyAvgSale: weekly.avgSale,

      currentWeekSales: currentWeek.totalSales,
      currentWeekTransactions: currentWeek.transactions,
      currentWeekItemsSold: currentWeek.itemsSold,
      currentWeekAvgSale: currentWeek.avgSale,

      monthlySales: monthly.totalSales,
      monthlyTransactions: monthly.transactions,
      monthlyItemsSold: monthly.itemsSold,
      monthlyAvgSale: monthly.avgSale,

      currentMonthSales: currentMonth.totalSales,
      currentMonthTransactions: currentMonth.transactions,
      currentMonthItemsSold: currentMonth.itemsSold,
      currentMonthAvgSale: currentMonth.avgSale,

      yearlySales: yearly.totalSales,
      yearlyTransactions: yearly.transactions,
      yearlyItemsSold: yearly.itemsSold,
      yearlyAvgSale: yearly.avgSale,

      currentYearSales: currentYear.totalSales,
      currentYearTransactions: currentYear.transactions,
      currentYearItemsSold: currentYear.itemsSold,
      currentYearAvgSale: currentYear.avgSale,

      salesTrend: {
        daily: dailyTrend,
        weekly: weeklyTrend,
        monthly: monthlyTrend,
        yearly: yearlyTrend,
      },

      topProducts: topProductsAgg.map(p => ({
        name: p._id,
        price: p.price,
        sales: p.sales,
        revenue: p.revenue,
      })),

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
        fromDate = getStartOfDay(now);
        toDate = getEndOfDay(now);
        break;
      case "weekly":
        fromDate = getStartOfWeek(now);
        toDate = getEndOfDay(now);
        break;
      case "monthly":
        fromDate = getStartOfMonth(now);
        toDate = getEndOfDay(now);
        break;
      case "yearly":
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
      { $limit: 20 }
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

// New: Product sales overview for all products, with unsold/low-selling/best-selling in period
const getProductSalesOverview = async (req, res) => {
  try {
    const { period, startDate, endDate, lowThreshold = 5 } = req.query;
    const now = new Date();
    let fromDate, toDate;
    switch (period) {
      case "daily":
        fromDate = getStartOfDay(now);
        toDate = getEndOfDay(now);
        break;
      case "weekly":
        fromDate = getStartOfWeek(now);
        toDate = getEndOfDay(now);
        break;
      case "monthly":
        fromDate = getStartOfMonth(now);
        toDate = getEndOfDay(now);
        break;
      case "yearly":
        fromDate = getStartOfYear(now);
        toDate = getEndOfDay(now);
        break;
      case "custom":
        fromDate = new Date(startDate);
        toDate = new Date(endDate);
        toDate.setHours(23, 59, 59, 999);
        break;
      default:
        fromDate = getStartOfMonth(now);
        toDate = getEndOfDay(now);
    }

    const allProducts = await Products.find({}, { name: 1, price: 1, barcode: 1 }).lean();

    const salesAgg = await Order.aggregate([
      { $match: { date: { $gte: fromDate, $lte: toDate } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          totalSold: { $sum: "$items.quantity" },
        }
      }
    ]);

    const salesMap = {};
    salesAgg.forEach((s) => {
      salesMap[s._id] = s.totalSold;
    });

    const result = allProducts.map((prod) => ({
      name: prod.name,
      price: prod.price,
      barcode: prod.barcode,
      totalSold: salesMap[prod.name] || 0,
    }));

    const unsoldProducts = result.filter((p) => p.totalSold === 0);
    const lowSellingProducts = result.filter((p) => p.totalSold > 0 && p.totalSold <= Number(lowThreshold));
    const topProduct = result.reduce((acc, curr) => (curr.totalSold > (acc?.totalSold || 0) ? curr : acc), null);

    res.json({
      from: fromDate,
      to: toDate,
      products: result,
      unsoldProducts,
      lowSellingProducts,
      topProduct,
    });
  } catch (error) {
    console.error("Error in getProductSalesOverview:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// New: Get best selling product on a specific date
const getBestProductByDate = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ message: "Date is required" });
    const dayStart = getStartOfDay(new Date(date));
    const dayEnd = getEndOfDay(new Date(date));

    const agg = await Order.aggregate([
      { $match: { date: { $gte: dayStart, $lte: dayEnd } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          totalSold: { $sum: "$items.quantity" },
          price: { $first: "$items.sellingPrice" }
        }
      },
      { $sort: { totalSold: -1 } },
      { $limit: 1 }
    ]);
    res.json({ date, bestProduct: agg[0] || null });
  } catch (error) {
    console.error("Error in getBestProductByDate:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const getProductsSoldBetweenDates = async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ message: "Both 'from' and 'to' dates are required" });
    }
    const fromDate = new Date(from);
    const toDate = new Date(to);
    toDate.setHours(23, 59, 59, 999);

    if (fromDate > toDate) {
      return res.status(400).json({ message: "'From' date cannot be after 'to' date" });
    }

    // All products for reference (name, price, barcode, etc.)
    const allProducts = await Products.find({}, { name: 1, sellingPrice: 1, barcode: 1 }).lean();

    // Aggregate totalSold for each product in date range
    const salesAgg = await Order.aggregate([
      { $match: { date: { $gte: fromDate, $lte: toDate } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          totalSold: { $sum: "$items.quantity" },
        }
      }
    ]);

    // Map product name to totalSold for quick lookup
    const salesMap = {};
    salesAgg.forEach((s) => {
      salesMap[s._id] = s.totalSold;
    });

    // Combine with all products (to include unsold products in range)
    const result = allProducts.map((prod) => ({
      name: prod.name,
      price: prod.sellingPrice,
      barcode: prod.barcode,
      totalSold: salesMap[prod.name] || 0,
    }));

    console.log(result);
    // Optionally, you can also sort by totalSold here or let the frontend do it.
    // result.sort((a, b) => b.totalSold - a.totalSold);

    res.json({
      from: fromDate,
      to: toDate,
      products: result,
    });
  } catch (error) {
    console.error("Error in getProductsSoldBetweenDates:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
module.exports = {
  getSalesSummary,
  getTopProductsByPeriod,
  getSalesByDateRange,
  getProductSalesOverview,
  getBestProductByDate,
  getProductsSoldBetweenDates,
};