const { Order } = require("../models/orderModel");

const getSalesSummary = async (req, res) => {
  try {
    const now = new Date();

    // Helper for start of day with offset
    const getStartOfDay = (date, offsetDays = 0) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - offsetDays);
      return d;
    };

    const startToday = getStartOfDay(now);
    const endToday = new Date(startToday);
    endToday.setHours(23, 59, 59, 999);

    const start7Days = getStartOfDay(now, 6);
    const start30Days = getStartOfDay(now, 29);
    const start365Days = getStartOfDay(now, 364);

    // Aggregate for a given range
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

    // 1. Daily (last 7 days)
    const salesTrendDaily = await Order.aggregate([
      { $match: { date: { $gte: start7Days, $lte: endToday } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$date" }
          },
          totalSales: { $sum: "$totalPrice" }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    const last7DateStrs = [];
    for (let i = 6; i >= 0; i--) {
      const dt = new Date();
      dt.setHours(0, 0, 0, 0);
      dt.setDate(dt.getDate() - i);
      last7DateStrs.push(dt.toISOString().split('T')[0]);
    }
    const dailySalesMap = {};
    salesTrendDaily.forEach(d => { dailySalesMap[d._id] = d.totalSales; });
    const salesTrendLast7 = last7DateStrs.map(dateStr => dailySalesMap[dateStr] || 0);

    // 2. Weekly (last 12 weeks)
    const salesTrendWeeklyAgg = await Order.aggregate([
      {
        $match: {
          date: { $gte: getStartOfDay(now, 7 * 11), $lte: endToday }
        }
      },
      {
        $group: {
          _id: {
            year: { $isoWeekYear: "$date" },
            week: { $isoWeek: "$date" }
          },
          totalSales: { $sum: "$totalPrice" }
        }
      },
      { $sort: { "_id.year": 1, "_id.week": 1 } }
    ]);
    let weekSalesMap = {};
    salesTrendWeeklyAgg.forEach(w => {
      weekSalesMap[`${w._id.year}-W${w._id.week}`] = w.totalSales;
    });

    let last12Weeks = [];
    function getWeekNumber(date) {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
      return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
    for (let i = 11; i >= 0; i--) {
      let d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      let w = getWeekNumber(d);
      let y = d.getUTCFullYear();
      last12Weeks.push(weekSalesMap[`${y}-W${w}`] || 0);
    }

    // 3. Monthly (last 12 months)
    const salesTrendMonthlyAgg = await Order.aggregate([
      {
        $match: {
          date: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1), $lte: endToday }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" }
          },
          totalSales: { $sum: "$totalPrice" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    let monthlySalesMap = {};
    salesTrendMonthlyAgg.forEach(m => {
      monthlySalesMap[`${m._id.year}-${m._id.month}`] = m.totalSales;
    });
    let last12Months = [];
    for (let i = 11; i >= 0; i--) {
      let d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      last12Months.push(monthlySalesMap[`${d.getFullYear()}-${d.getMonth() + 1}`] || 0);
    }

    // 4. Yearly (last 5 years)
    const salesTrendYearlyAgg = await Order.aggregate([
      {
        $match: {
          date: { $gte: new Date(now.getFullYear() - 4, 0, 1), $lte: endToday }
        }
      },
      {
        $group: {
          _id: { year: { $year: "$date" } },
          totalSales: { $sum: "$totalPrice" }
        }
      },
      { $sort: { "_id.year": 1 } }
    ]);
    let yearlySalesMap = {};
    salesTrendYearlyAgg.forEach(y => {
      yearlySalesMap[y._id.year] = y.totalSales;
    });
    let last5Years = [];
    for (let i = 4; i >= 0; i--) {
      let y = now.getFullYear() - i;
      last5Years.push(yearlySalesMap[y] || 0);
    }

    // Top products sold in last 30 days
    const topProductsAgg = await Order.aggregate([
      { $match: { date: { $gte: start30Days, $lte: endToday } } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name",
          sales: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
        }
      },
      { $sort: { sales: -1 } },
      { $limit: 10 }
    ]);

    const today = await aggregateMetrics(startToday, endToday);
    const weekly = await aggregateMetrics(start7Days, endToday);
    const monthly = await aggregateMetrics(start30Days, endToday);
    const yearly = await aggregateMetrics(start365Days, endToday);

    res.json({
      todaySales: today.totalSales,
      weeklySales: weekly.totalSales,
      monthlySales: monthly.totalSales,
      yearlySales: yearly.totalSales,
      todayTransactions: today.transactions,
      weeklyTransactions: weekly.transactions,
      monthlyTransactions: monthly.transactions,
      yearlyTransactions: yearly.transactions,
      todayItemsSold: today.itemsSold,
      weeklyItemsSold: weekly.itemsSold,
      monthlyItemsSold: monthly.itemsSold,
      yearlyItemsSold: yearly.itemsSold,
      todayAvgSale: today.avgSale,
      weeklyAvgSale: weekly.avgSale,
      monthlyAvgSale: monthly.avgSale,
      yearlyAvgSale: yearly.avgSale,
      salesTrend: {
        daily: salesTrendLast7,
        weekly: last12Weeks,
        monthly: last12Months,
        yearly: last5Years,
      },
      topProducts: topProductsAgg.map(p => ({
        name: p._id,
        sales: p.sales,
        revenue: p.revenue,
      })),
    });
  } catch (err) {
    console.error("Error fetching sales summary:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// controllers/reportController.js


const getStartOfDay = (date, offsetDays = 0) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d;
};


const getTopProductsByPeriod = async (req, res) => {
  try {
    const period = req.query.period;
    if (!period || !["daily", "weekly", "monthly", "yearly"].includes(period)) {
      return res.status(400).json({ message: "Invalid or missing period" });
    }
    const now = new Date();
    let fromDate;

    switch (period) {
      case "daily":
        fromDate = getStartOfDay(now);
        break;
      case "weekly":
        fromDate = getStartOfDay(now, 6); // last 7 days including today
        break;
      case "monthly":
        fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case "yearly":
        fromDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const toDate = new Date();
    toDate.setHours(23, 59, 59, 999);

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
      { $limit: 10 }
    ]);

    res.json({
      period,
      products: topProducts.map(p => ({
        name: p._id,
        price: p.price,
        sales: p.sales,
        revenue: p.revenue,
      })),
    });
  } catch (error) {
    console.error("Error fetching top products:", error);
    res.status(500).json({ message: "Server error" });
  }
};




module.exports = { getSalesSummary , getTopProductsByPeriod, };
