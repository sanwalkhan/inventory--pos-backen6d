const { Products } = require("../models/productModel");
const { Order } = require("../models/orderModel");
const User = require("../models/userModel");
const { getOrganizationId } = require("../middleware/authmiddleware");

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

const getRecentOrders = async (organizationId, limit = 5) => {
  return Order.find({ organizationId: organizationId })
    .sort({ date: -1 })
    .limit(limit)
    .select("userName totalPrice date items paymentMethod")
    .lean();
};

const getLowStockItems = async (organizationId, threshold = 5, limit = 5) => {
  return Products.find({ 
    quantity: { $lte: threshold }, 
    organizationId: organizationId 
  })
    .sort({ quantity: 1 })
    .limit(limit)
    .select("name quantity")
    .lean();
};

const getActiveUsersCount = async (organizationId) => {
  return User.countDocuments({ 
    organizationId: organizationId,
  });
};

const getOrdersCount = async (organizationId) => {
  const totalOrders = await Order.countDocuments({ organizationId: organizationId });
  const todayOrders = await Order.countDocuments({
    organizationId: organizationId,
    date: {
      $gte: getStartOfToday(),
      $lte: getEndOfToday(),
    },
  });
  return { totalOrders, todayOrders };
};

const getInventoryItemsCount = async (organizationId) => {
  const count = await Products.countDocuments({ 
    quantity: { $gt: 0 }, 
    organizationId: organizationId 
  });
  return count;
};

const adminDashboardStats = async (req, res) => {
  const organizationId = getOrganizationId(req);
  
  if (!organizationId) {
    return res.status(400).json({ 
      success: false,
      message: "Organization ID is required" 
    });
  }

  try {
    const [ordersCount, activeUsers, inventoryCount, recentOrders, lowStock] =
      await Promise.all([
        getOrdersCount(organizationId),
        getActiveUsersCount(organizationId),
        getInventoryItemsCount(organizationId),
        getRecentOrders(organizationId, 5),
        getLowStockItems(organizationId, 5),
      ]);

    res.json({
      success: true,
      organizationId,
      totalOrders: ordersCount.totalOrders,
      ordersToday: ordersCount.todayOrders,
      activeUsers,
      inventoryItems: inventoryCount,
      recentOrders,
      lowStockItems: lowStock,
    });
  } catch (error) {
    console.error("Error fetching admin dashboard stats:", error);
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
};

module.exports = { adminDashboardStats };