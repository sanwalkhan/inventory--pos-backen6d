const { Order } = require("../models/orderModel");
const { Products } = require("../models/productModel");
const User = require("../models/userModel");

// Helper function to calculate tax and pricing breakdown
function calculateItemBreakdown(product, quantity) {
  const costPrice = parseFloat(product.price);
  const sellingPrice = parseFloat(product.sellingPrice);
  const sellingPriceWithoutDiscount = parseFloat(product.sellingPriceWithoutDiscount);

  // Tax percentages
  const salesTax = parseFloat(product.salesTax || 0);
  const customDuty = parseFloat(product.customDuty || 0);
  const withholdingTax = parseFloat(product.withholdingTax || 0);

  // Margin and discount percentages
  const marginPercent = parseFloat(product.marginPercent || 0);
  const discount = parseFloat(product.discount || 0);

  // Calculate amounts
  const salesTaxAmount = (costPrice * salesTax) / 100;
  const customDutyAmount = (costPrice * customDuty) / 100;
  const withholdingTaxAmount = (costPrice * withholdingTax) / 100;
  const marginAmount = (costPrice * marginPercent) / 100;
  const discountAmount = (sellingPriceWithoutDiscount * discount) / 100;

  return {
    costPrice,
    sellingPrice,
    sellingPriceWithoutDiscount,
    salesTax,
    customDuty,
    withholdingTax,
    marginPercent,
    discount,
    salesTaxAmount: Number(salesTaxAmount.toFixed(2)),
    customDutyAmount: Number(customDutyAmount.toFixed(2)),
    withholdingTaxAmount: Number(withholdingTaxAmount.toFixed(2)),
    marginAmount: Number(marginAmount.toFixed(2)),
    discountAmount: Number(discountAmount.toFixed(2)),
    subtotal: Number((sellingPrice * quantity).toFixed(2)),
  };
}

const createOrder = async (req, res) => {
  try {
    console.log("Received order data:", req.body);
    const { userName, userPhone, cashierId, date, items, totalPrice, paymentMethod } = req.body;

    const cashier = await User.findById(cashierId).select("username");
    if (!cashier) {
      return res.status(404).json({ message: "Cashier not found" });
    }
    const cashierName = cashier.username;
    console.log("cashierName is :", cashierName);

    // Validate required fields
    if (!userName || !userPhone || !cashierId || !cashierName || !date || !items?.length || !totalPrice || !paymentMethod) {
      return res.status(400).json({
        message: "Missing required order data",
        required: ["userName", "userPhone", "cashierId", "date", "items", "totalPrice", "paymentMethod"]
      });
    }

    // Validate payment method
    if (!["cash", "card", "mobile"].includes(paymentMethod)) {
      return res.status(400).json({
        message: "Invalid payment method. Must be 'cash', 'card', or 'mobile'"
      });
    }

    // Validate items structure and get full product details with pricing breakdown
    const processedItems = [];
    let totalSalesTax = 0;
    let totalCustomDuty = 0;
    let totalWithholdingTax = 0;
    let totalMargin = 0;
    let totalDiscount = 0;
    let totalCostPrice = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (!item.productId || !item.name || !item.sellingPrice || !item.quantity) {
        return res.status(400).json({
          message: `Item at index ${i} is missing required fields: productId, name, sellingPrice, quantity`
        });
      }

      if (isNaN(item.sellingPrice) || item.sellingPrice <= 0) {
        return res.status(400).json({
          message: `Item "${item.name}" has invalid selling price`
        });
      }

      if (isNaN(item.quantity) || item.quantity <= 0) {
        return res.status(400).json({
          message: `Item "${item.name}" has invalid quantity`
        });
      }

      // Get product to fetch all details including tax rates and pricing
      const product = await Products.findById(item.productId);
      if (!product) {
        return res.status(404).json({
          message: `Product not found: ${item.name}`
        });
      }

      // Verify sufficient stock
      if (product.quantity < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for product: ${item.name}. Available: ${product.quantity}, Requested: ${item.quantity}`
        });
      }

      // Calculate item breakdown
      const breakdown = calculateItemBreakdown(product, parseInt(item.quantity));

      // Accumulate order totals
      totalSalesTax += breakdown.salesTaxAmount * item.quantity;
      totalCustomDuty += breakdown.customDutyAmount * item.quantity;
      totalWithholdingTax += breakdown.withholdingTaxAmount * item.quantity;
      totalMargin += breakdown.marginAmount * item.quantity;
      totalDiscount += breakdown.discountAmount * item.quantity;
      totalCostPrice += breakdown.costPrice * item.quantity;

      processedItems.push({
        productId: item.productId,
        name: item.name,
        barcode: product.barcode,
        hsCode: product.hsCode,
        costPrice: breakdown.costPrice,
        sellingPrice: breakdown.sellingPrice,
        sellingPriceWithoutDiscount: breakdown.sellingPriceWithoutDiscount,
        salesTax: breakdown.salesTax,
        customDuty: breakdown.customDuty,
        withholdingTax: breakdown.withholdingTax,
        marginPercent: breakdown.marginPercent,
        discount: breakdown.discount,
        salesTaxAmount: breakdown.salesTaxAmount,
        customDutyAmount: breakdown.customDutyAmount,
        withholdingTaxAmount: breakdown.withholdingTaxAmount,
        marginAmount: breakdown.marginAmount,
        discountAmount: breakdown.discountAmount,
        quantity: parseInt(item.quantity),
        subtotal: breakdown.subtotal,
      });
    }

    // Validate total price
    if (isNaN(totalPrice) || totalPrice <= 0) {
      return res.status(400).json({ message: "Invalid total price" });
    }

    // Create the order with full pricing details
    const order = new Order({
      userName: userName.trim(),
      userPhone: userPhone.trim(),
      cashierId,
      cashierName,
      date: new Date(date),
      items: processedItems,
      totalPrice: parseFloat(totalPrice),
      totalSalesTax: Number(totalSalesTax.toFixed(2)),
      totalCustomDuty: Number(totalCustomDuty.toFixed(2)),
      totalWithholdingTax: Number(totalWithholdingTax.toFixed(2)),
      totalMargin: Number(totalMargin.toFixed(2)),
      totalDiscount: Number(totalDiscount.toFixed(2)),
      totalCostPrice: Number(totalCostPrice.toFixed(2)),
      paymentMethod,
    });

    const savedOrder = await order.save();
    console.log("Order saved successfully:", savedOrder._id);

    return res.status(201).json({
      success: true,
      message: "Order created successfully",
      ...savedOrder.toObject()
    });
  } catch (err) {
    console.error("Error creating order:", err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        errors: Object.values(err.errors).map(e => e.message)
      });
    }
    return res.status(500).json({
      message: "Server error while creating order",
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
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

    const todayRevenue = await Order.aggregate([
      {
        $match: {
          date: { $gte: startOfToday, $lte: endOfToday }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$totalPrice" }
        }
      }
    ]);

    res.json({
      totalOrders,
      todayOrders,
      todayRevenue: todayRevenue.length > 0 ? todayRevenue[0].totalRevenue : 0
    });
  } catch (err) {
    console.error("Error fetching order stats:", err);
    res.status(500).json({ message: "Server error while fetching order stats" });
  }
};

const getRecentOrders = async (req, res) => {
  try {
    const recentOrders = await Order.find()
      .sort({ date: -1 })
      .limit(5)
      .select('userName userPhone totalPrice paymentMethod date items');

    res.json({ recentOrders });
  } catch (err) {
    console.error("Error fetching recent orders:", err);
    res.status(500).json({ message: "Server error while fetching recent orders" });
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
      return res.status(400).json({
        message: `Insufficient stock quantity. Available: ${product.quantity}, Requested: ${amount}`
      });
    }

    product.quantity -= amount;
    await product.save();

    res.status(200).json({
      success: true,
      message: `Decreased quantity by ${amount}`,
      updatedQuantity: product.quantity,
      productId: product._id,
      productName: product.name
    });
  } catch (error) {
    console.error("Error decreasing quantity:", error);
    res.status(500).json({ message: "Server error while decreasing product quantity" });
  }
};

const getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Optional filters
    const filters = {};
    if (req.query.cashierId) {
      filters.cashierId = req.query.cashierId;
    }
    if (req.query.paymentMethod) {
      filters.paymentMethod = req.query.paymentMethod;
    }
    if (req.query.startDate && req.query.endDate) {
      filters.date = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    const total = await Order.countDocuments(filters);
    const orders = await Order.find(filters)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .populate('items.productId', 'name category subcategory');

    res.json({
      orders,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalOrders: total,
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1
    });
  } catch (err) {
    console.error("Error fetching paginated orders:", err);
    res.status(500).json({ message: "Server error while fetching orders" });
  }
};

const getTopOrders = async (req, res) => {
  try {
    const topOrders = await Order.find()
      .sort({ totalPrice: -1 })
      .limit(5)
      .select('userName userPhone totalPrice date items paymentMethod');

    res.json({ topOrders });
  } catch (err) {
    console.error("Error fetching top orders:", err);
    res.status(500).json({ message: "Server error while fetching top orders" });
  }
};

const getOrdersByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: "Start date and end date are required" });
    }

    const orders = await Order.find({
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    }).sort({ date: -1 });

    const totalRevenue = orders.reduce((sum, order) => sum + order.totalPrice, 0);

    res.json({
      orders,
      totalOrders: orders.length,
      totalRevenue,
      startDate,
      endDate
    });
  } catch (err) {
    console.error("Error fetching orders by date range:", err);
    res.status(500).json({ message: "Server error while fetching orders by date range" });
  }
};

const getCashierOrders = async (req, res) => {
  try {
    const { cashierId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await Order.countDocuments({ cashierId });
    const orders = await Order.find({ cashierId })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      orders,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalOrders: total
    });
  } catch (err) {
    console.error("Error fetching cashier orders:", err);
    res.status(500).json({ message: "Server error while fetching cashier orders" });
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    await Order.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Order deleted successfully",
      deletedOrderId: id
    });
  } catch (err) {
    console.error("Error deleting order:", err);
    res.status(500).json({ message: "Server error while deleting order" });
  }
};

module.exports = {
  createOrder,
  getOrderStats,
  getRecentOrders,
  decreaseProductQuantity,
  getOrders,
  getTopOrders,
  getOrdersByDateRange,
  getCashierOrders,
  deleteOrder,
};
