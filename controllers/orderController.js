const { Order } = require("../models/orderModel");
const { Products } = require("../models/productModel");

const createOrder = async (req, res) => {
  try {
    const { userName, userPhone, date, items, totalPrice, paymentMethod } =
      req.body;

    console.log("Order data received:", req.body); // Debug log

    if (
      !userName ||
      !userPhone ||
      !date ||
      !items?.length ||
      !totalPrice ||
      !paymentMethod
    ) {
      return res.status(400).json({ message: "Missing order data" });
    }

    const order = new Order({
      userName,
      userPhone, // SAVE PHONE
      date,
      items,
      totalPrice,
      paymentMethod,
    });

    const savedOrder = await order.save();
    console.log("Order saved successfully:", savedOrder);
    return res.status(201).json(savedOrder);
  } catch (err) {
    console.error("Error creating order:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
const getOrderStats = async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todayOrders = await Order.countDocuments({
      date: { $gte: startOfToday, $lte: endOfToday },
    });

    res.json({ totalOrders, todayOrders });
  } catch (err) {
    console.error("Error fetching order stats:", err);
    res.status(500).json({ message: "Server error" });
  }
};
const recentOrder = async (req, res) => {
  try {
    const recentOrders = await Order.find().sort({ date: -1 }).limit(5);
    res.json({ recentOrders });
  } catch (err) {
    console.error("Error fetching recent orders:", err);
    res.status(500).json({ message: "Server error" });
  }
};
const decreaseProductQuantity = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid decrease amount" });
    }

    const product = await Products.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.quantity < amount) {
      return res.status(400).json({ message: "Insufficient stock quantity" });
    }

    product.quantity -= amount;
    await product.save();

    res.status(200).json({
      message: `Decreased quantity by ${amount}`,
      updatedQuantity: product.quantity,
    });
  } catch (error) {
    console.error("Error decreasing quantity:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};
const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Order.countDocuments();
    const orders = await Order.find()
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      orders,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalOrders: total,
    });
  } catch (err) {
    console.error("Error fetching paginated orders:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getTopOrders = async (req, res) => {
  try {
    const topOrders = await Order.find()
      .sort({ totalPrice: -1 })
      .limit(5);
    res.json({ topOrders });
  } catch (err) {
    console.error("Error fetching top orders:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createOrder,
  getOrderStats,
  recentOrder,
  decreaseProductQuantity,
  getOrders,
  getTopOrders,
};
