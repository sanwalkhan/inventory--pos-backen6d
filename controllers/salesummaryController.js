// In your orderController.js (where other order methods are)
const { Order} = require("../models/orderModel");
const getSalesSummary = async (req, res) => {
  try {
    const now = new Date();

    // Helper to get start of day optionally offset by days
    const getStartOfDay = (date, offsetDays = 0) => {
      const d = new Date(date);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - offsetDays);
      return d;
    };

    // Today
    const startToday = getStartOfDay(now);
    const endToday = new Date(startToday);
    endToday.setHours(23, 59, 59, 999);

    // Last 7 days (including today)
    const start7Days = getStartOfDay(now, 6);

    // Last 30 days (including today)
    const start30Days = getStartOfDay(now, 29);

    // Last 365 days (including today)
    const start365Days = getStartOfDay(now, 364);

    // Aggregate to sum totalPrice by date range:
    // We'll use multiple queries but you can optimize with aggregation if needed.

    // Total sales overall
    const totalSalesAgg = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);
    const totalSales = totalSalesAgg[0]?.total || 0;

    // Sales today
    const todaySalesAgg = await Order.aggregate([
      {
        $match: {
          date: { $gte: startToday, $lte: endToday },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);
    const todaySales = todaySalesAgg[0]?.total || 0;

    // Last 7 days sales
    const weeklySalesAgg = await Order.aggregate([
      {
        $match: {
          date: { $gte: start7Days, $lte: endToday },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);
    const weeklySales = weeklySalesAgg[0]?.total || 0;

    // Last 30 days sales
    const monthlySalesAgg = await Order.aggregate([
      {
        $match: {
          date: { $gte: start30Days, $lte: endToday },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);
    const monthlySales = monthlySalesAgg[0]?.total || 0;

    // Last 365 days sales
    const yearlySalesAgg = await Order.aggregate([
      {
        $match: {
          date: { $gte: start365Days, $lte: endToday },
        },
      },
      { $group: { _id: null, total: { $sum: "$totalPrice" } } },
    ]);
    const yearlySales = yearlySalesAgg[0]?.total || 0;

    res.json({
      todaySales,
      weeklySales,
      monthlySales,
      yearlySales,
      totalSales,
    });
  } catch (err) {
    console.error("Error fetching sales summary:", err);
    res.status(500).json({ message: "Server error" });
  }
};
module.exports = {
  getSalesSummary,
};