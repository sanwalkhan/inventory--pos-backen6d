const { Products } = require("../models/productModel");
const { Order } = require("../models/orderModel");
const User = require("../models/userModel"); // adjust path as needed

// Helper: get start of today
const getStartOfToday = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

const getEndOfToday = () => {
  const end = new Date(getStartOfToday());
  end.setHours(23, 59, 59, 999);
  return end;
};

const getRecentOrders = async (limit = 5) => {
  return Order.find({})
    .sort({ date: -1 })
    .limit(limit)
    .select("userName totalPrice date items paymentMethod")
    .lean();
};

const getLowStockItems = async (threshold = 5, limit = 5) => {
  return Products.find({ quantity: { $lte: threshold } })
    .sort({ quantity: 1 })
    .limit(limit)
    .select("name quantity")
    .lean();
};

const getActiveUsersCount = async () => {
  // Define active users as those who have logged in in past 30 days? Adjust as per your requirement
  // Assuming User schema has a 'lastLogin' or similar field. If not, count all users.
  // For simplicity, count all users here.
  return User.countDocuments();
};

const getOrdersCount = async () => {
  const totalOrders = await Order.countDocuments();
  const todayOrders = await Order.countDocuments({
    date: {
      $gte: getStartOfToday(),
      $lte: getEndOfToday(),
    },
  });
  return { totalOrders, todayOrders };
};

const getInventoryItemsCount = async () => {
  return Products.countDocuments();
};

const adminDashboardStats = async (req, res) => {
  try {
    const [ordersCount, activeUsers, inventoryCount, recentOrders, lowStock] =
      await Promise.all([
        getOrdersCount(),
        getActiveUsersCount(),
        getInventoryItemsCount(),
        getRecentOrders(5),
        getLowStockItems(5),
      ]);

    res.json({
      totalOrders: ordersCount.totalOrders,
      ordersToday: ordersCount.todayOrders,
      activeUsers,
      inventoryItems: inventoryCount,
      recentOrders,
      lowStockItems: lowStock,
    });
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { adminDashboardStats };
