const { Products } = require("../models/productModel");
const { Order } = require("../models/orderModel");
const CashierSession = require('../models/cashierModel');
const {getOrganizationId} = require('../middleware/authmiddleware');

// Get quick stats for cashier dashboard
exports.getCashierStats = async (req, res) => {
  const organizationId = getOrganizationId(req);
  try {
    const cashierId = req.params.cashierId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Update activity timestamp
    await CashierSession.findOneAndUpdate(
      { 
        cashierId, 
        sessionDate: today.toISOString().split('T')[0],
        status: 'active' 
      },
      { lastActivityTime: new Date() }
    );

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

    // Update activity timestamp
    const today = new Date().toISOString().split('T')[0];
    await CashierSession.findOneAndUpdate(
      { 
        cashierId, 
        sessionDate: today,
        status: 'active' 
      },
      { lastActivityTime: new Date() }
    );

    // Sort by creation time (createdAt) descending and limit to 5
    const transactions = await Order.find({ cashierId })
      .sort({ date: -1 })
      .limit(5);

    // Get total amount for all orders by this cashier
    const totalAmountResult = await Order.aggregate([
      { $match: { cashierId } },
      { $group: { _id: null, totalAmount: { $sum: '$totalPrice' } } }
    ]);

    const totalAmount = totalAmountResult.length > 0 ? totalAmountResult[0].totalAmount : 0;

    res.json({
      transactions,
      totalAmount: totalAmount.toFixed(2)
    });
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

    const products = await Products.find({ 
      createdAt: { $gte: threeDaysAgo },
      quantity: { $gt: 0 } // Only show products in stock
    }).sort({
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

    // Update activity timestamp
    const today = new Date().toISOString().split('T')[0];
    await CashierSession.findOneAndUpdate(
      { 
        cashierId, 
        sessionDate: today,
        status: 'active' 
      },
      { lastActivityTime: new Date() }
    );

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
    const cashierId = req.headers['cashier-id']; // Get cashier ID from headers

    // Update activity timestamp if cashier ID is provided
    if (cashierId) {
      const today = new Date().toISOString().split('T')[0];
      await CashierSession.findOneAndUpdate(
        { 
          cashierId, 
          sessionDate: today,
          status: 'active' 
        },
        { lastActivityTime: new Date() }
      );
    }

    const product = await Products.findOne({ barcode });

    if (!product) return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (error) {
    console.error("Error in getProductByBarcode:", error);
    res.status(500).json({ message: "Server error" });
  }
};
exports.getProductById = async (req, res) => {
  try {
    const productId = req.params.id;
    const cashierId = req.headers['cashier-id']; // Get cashier ID from headers

    // Update activity timestamp if cashier ID is provided
    if (cashierId) {
      const today = new Date().toISOString().split('T')[0];
      await CashierSession.findOneAndUpdate(
        { 
          cashierId, 
          sessionDate: today,
          status: 'active' 
        },
        { lastActivityTime: new Date() }
      );
    }

    const product = await Products.findById(productId);

    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: "Product not found" 
      });
    }

    res.json({
      success: true,
      ...product.toObject()
    });
  } catch (error) {
    console.error("Error in getProductById:", error);
    
    // Handle invalid ObjectId
    if (error.name === 'CastError') {
      return res.status(404).json({ 
        success: false,
        message: "Invalid product ID" 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: "Server error" 
    });
  }
};