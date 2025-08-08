const { Products } = require("../models/productModel");
const { Order } = require("../models/orderModel");

// Get quick stats for cashier dashboard
exports.getCashierStats = async (req, res) => {
  try {
    const cashierId = req.params.cashierId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fetch orders made today by this cashier (filter by 'date' field)
    const todaysOrders = await Order.find({
      cashierId,
      date: { $gte: today },
    });

    // Total sales amount today
    const todaysSales = todaysOrders.reduce((sum, order) => sum + order.totalPrice, 0);

    // Number of transactions (orders) today
    const transactionsCount = await Order.countDocuments({
      cashierId,
      date: { $gte: today },
    });

    // Total quantity of items sold today
    const itemsSold = todaysOrders.reduce((sum, order) => {
      return (
        sum +
        order.items.reduce((itmSum, item) => itmSum + item.quantity, 0)
      );
    }, 0);

    // Fetch all historical orders by this cashier for average sale calculation
    const allOrders = await Order.find({ cashierId });
    const avgSale =
      allOrders.length > 0
        ? allOrders.reduce((sum, order) => sum + order.totalPrice, 0) / allOrders.length
        : 0;

    res.json({
      todaysSales: todaysSales.toFixed(2),
      transactionsCount,
      itemsSold,
      avgSale: avgSale.toFixed(2),
    });
  } catch (error) {
    console.error("Error in getCashierStats:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get recent transactions (limit 5 latest orders)
exports.getRecentTransactions = async (req, res) => {
  try {
    const cashierId = req.params.cashierId;
    //fetch totalAmount from order model with respect to cashierID
    const totalAmount = await Order.find({ cashierId }).select("totalPrice");

    // Sort by creation time (createdAt) descending and limit to 5
    // Assuming timestamps: true in your schema adds createdAt
    const transactions = await Order.find({ cashierId })
      .sort({ date: -1 })
      .limit(5);

    res.json(transactions , totalAmount);
  } catch (error) {
    console.error("Error in getRecentTransactions:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get latest products added in last 3 days
exports.getLatestProducts = async (req, res) => {
  try {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const products = await Products.find({ createdAt: { $gte: threeDaysAgo } }).sort({
      createdAt: -1,
    });

    res.json(products);
  } catch (error) {
    console.error("Error in getLatestProducts:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get orders by cashier for print receipt modal (latest 20)
exports.getOrdersByCashier = async (req, res) => {
  try {
    const cashierId = req.params.cashierId;
   

    const orders = await Order.find({ cashierId })
      .sort({ createdAt: -1 })
      .limit(20);

    res.json(orders);
  } catch (error) {
    console.error("Error in getOrdersByCashier:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get product by barcode (for scanning)
exports.getProductByBarcode = async (req, res) => {
  try {
    const barcode = req.params.barcode;

    const product = await Products.findOne({ barcode });

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (error) {
    console.error("Error in getProductByBarcode:", error);
    res.status(500).json({ message: "Server error" });
  }
};
