const { Category } = require("../models/categoryModel");
const { Subcategory } = require("../models/subcategoryModel");
const { Products } = require("../models/productModel");
const { Order } = require("../models/orderModel");
const { Customer } = require("../models/customerModel");
const Supplier = require("../models/supplierModel");
const Users = require("../models/userModel");
const CashierDailySession = require("../models/cashierModel");

const trainedResponses = {
  greetings: [
    "hello",
    "hi",
    "hey",
    "good morning",
    "good afternoon",
    "good evening",
  ],
  farewell: ["bye", "goodbye", "see you", "take care"],
  help: ["help", "assist", "support", "guide"],
  products: ["product", "item", "inventory", "stock"],
  orders: ["order", "sale", "transaction", "purchase"],
  customers: ["customer", "client", "buyer"],
  suppliers: ["supplier", "vendor"],
  categories: ["category", "categories"],
  reports: ["report", "analytics", "statistics", "stats"],
  users: ["user", "staff", "employee", "cashier"],
  tax: ["tax", "hs code", "duty", "withholding"],
};

const getContextualResponse = async (message, userId) => {
  const lowerMessage = message.toLowerCase();

  if (trainedResponses.greetings.some((word) => lowerMessage.includes(word))) {
    return {
      text: "Hello! Welcome to your POS AI Assistant. I can help you with:\n\n• 📦 Products & Inventory Management\n• 💰 Sales & Orders Analysis\n• 👥 Customer Information\n• 📊 Reports & Analytics\n• 🏢 Supplier Management\n• 👤 User Management\n• 💳 Tax & HS Code Information\n\nWhat would you like to explore today?",
      type: "greeting",
    };
  }

  if (trainedResponses.farewell.some((word) => lowerMessage.includes(word))) {
    return {
      text: "Thank you for using the POS AI Assistant! Have a great day! Feel free to return anytime you need help. 👋",
      type: "farewell",
    };
  }

  if (trainedResponses.help.some((word) => lowerMessage.includes(word))) {
    return {
      text: "I'm your intelligent POS assistant! Here's what I can do:\n\n📦 **Products & Inventory**\n   • Check product details\n   • View stock levels\n   • Search by barcode or name\n   • Track low stock items\n\n💰 **Sales & Orders**\n   • View recent orders\n   • Sales statistics\n   • Revenue analysis\n   • Payment methods breakdown\n\n👥 **Customers**\n   • Customer information\n   • Purchase history\n   • Top customers\n   • Loyalty insights\n\n📊 **Reports & Analytics**\n   • Sales trends\n   • Product performance\n   • Tax breakdowns\n   • Revenue metrics\n\n🏢 **Suppliers**\n   • Supplier information\n   • Orders & dues\n   • Inventory received\n\n💳 **Tax & HS Codes**\n   • HS code information\n   • Tax calculations\n   • Duty & exemptions\n\nJust ask me anything!",
      type: "help",
    };
  }

  if (
    trainedResponses.products.some((word) => lowerMessage.includes(word)) ||
    lowerMessage.includes("how many products")
  ) {
    try {
      const totalProducts = await Products.countDocuments();
      const lowStock = await Products.countDocuments({ quantity: { $lt: 10 } });
      const outOfStock = await Products.countDocuments({ quantity: 0 });
      const recentProducts = await Products.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name quantity price");

      let response = `📦 **Product Inventory Summary**\n\n`;
      response += `• Total Products: **${totalProducts}**\n`;
      response += `• Low Stock Items: **${lowStock}** (qty < 10)\n`;
      response += `• Out of Stock: **${outOfStock}**\n\n`;

      if (recentProducts.length > 0) {
        response += `🆕 **Recently Added Products:**\n`;
        recentProducts.forEach((product, index) => {
          response += `${index + 1}. ${product.name} - Qty: ${product.quantity}, Price: Rs ${product.price}\n`;
        });
      }

      response += `\n💡 You can ask me about:\n• Specific product details\n• Low stock alerts\n• Product categories\n• Price information`;

      return { text: response, type: "products", data: { totalProducts, lowStock, outOfStock } };
    } catch (error) {
      return {
        text: "I encountered an issue fetching product data. Please try again.",
        type: "error",
      };
    }
  }

  if (
    trainedResponses.orders.some((word) => lowerMessage.includes(word)) ||
    lowerMessage.includes("sales")
  ) {
    try {
      const totalOrders = await Order.countDocuments();
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayOrders = await Order.countDocuments({ date: { $gte: today } });
      const todaySales = await Order.aggregate([
        { $match: { date: { $gte: today } } },
        { $group: { _id: null, total: { $sum: "$totalPrice" } } },
      ]);

      const recentOrders = await Order.find()
        .sort({ date: -1 })
        .limit(5)
        .select("userName totalPrice paymentMethod date");

      let response = `💰 **Sales & Orders Summary**\n\n`;
      response += `• Total Orders: **${totalOrders}**\n`;
      response += `• Today's Orders: **${todayOrders}**\n`;
      response += `• Today's Revenue: **Rs ${todaySales[0]?.total || 0}**\n\n`;

      if (recentOrders.length > 0) {
        response += `🛒 **Recent Orders:**\n`;
        recentOrders.forEach((order, index) => {
          response += `${index + 1}. ${order.userName} - Rs ${order.totalPrice} (${order.paymentMethod})\n`;
        });
      }

      response += `\n💡 Ask me about:\n• Daily/weekly/monthly sales\n• Payment method breakdown\n• Top selling products\n• Revenue analytics`;

      return { text: response, type: "orders", data: { totalOrders, todayOrders, todaySales: todaySales[0]?.total || 0 } };
    } catch (error) {
      return {
        text: "I had trouble fetching sales data. Please try again.",
        type: "error",
      };
    }
  }

  if (trainedResponses.customers.some((word) => lowerMessage.includes(word))) {
    try {
      const totalCustomers = await Customer.countDocuments();
      const topCustomers = await Customer.find()
        .sort({ totalSpent: -1 })
        .limit(5)
        .select("name phone totalSpent purchaseCount");

      let response = `👥 **Customer Analytics**\n\n`;
      response += `• Total Customers: **${totalCustomers}**\n\n`;

      if (topCustomers.length > 0) {
        response += `⭐ **Top Customers:**\n`;
        topCustomers.forEach((customer, index) => {
          response += `${index + 1}. ${customer.name} - Rs ${customer.totalSpent} (${customer.purchaseCount} orders)\n`;
        });
      }

      response += `\n💡 I can help you:\n• Find customer purchase history\n• View customer details\n• Track loyal customers\n• Analyze buying patterns`;

      return { text: response, type: "customers", data: { totalCustomers } };
    } catch (error) {
      return {
        text: "I couldn't fetch customer data. Please try again.",
        type: "error",
      };
    }
  }

  if (trainedResponses.suppliers.some((word) => lowerMessage.includes(word))) {
    try {
      const totalSuppliers = await Supplier.countDocuments();
      const activeSuppliers = await Supplier.countDocuments({ isActive: true });
      const totalDues = await Supplier.aggregate([
        { $group: { _id: null, total: { $sum: "$totalDues" } } },
      ]);

      const recentSuppliers = await Supplier.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email totalDues totalOrders");

      let response = `🏢 **Supplier Management**\n\n`;
      response += `• Total Suppliers: **${totalSuppliers}**\n`;
      response += `• Active Suppliers: **${activeSuppliers}**\n`;
      response += `• Total Outstanding Dues: **Rs ${totalDues[0]?.total || 0}**\n\n`;

      if (recentSuppliers.length > 0) {
        response += `📋 **Recent Suppliers:**\n`;
        recentSuppliers.forEach((supplier, index) => {
          response += `${index + 1}. ${supplier.name} - ${supplier.totalOrders} orders, Dues: Rs ${supplier.totalDues}\n`;
        });
      }

      response += `\n💡 Ask me about:\n• Supplier details\n• Outstanding payments\n• Supplier orders\n• Inventory received`;

      return { text: response, type: "suppliers", data: { totalSuppliers, activeSuppliers } };
    } catch (error) {
      return {
        text: "I couldn't retrieve supplier information. Please try again.",
        type: "error",
      };
    }
  }

  if (trainedResponses.categories.some((word) => lowerMessage.includes(word))) {
    try {
      const totalCategories = await Category.countDocuments();
      const totalSubcategories = await Subcategory.countDocuments();
      const categories = await Category.find().select("categoryName");

      let response = `📂 **Category Overview**\n\n`;
      response += `• Total Categories: **${totalCategories}**\n`;
      response += `• Total Subcategories: **${totalSubcategories}**\n\n`;

      if (categories.length > 0) {
        response += `📑 **Available Categories:**\n`;
        categories.forEach((cat, index) => {
          response += `${index + 1}. ${cat.categoryName}\n`;
        });
      }

      response += `\n💡 I can help with:\n• Category management\n• Subcategory information\n• Products by category\n• HS code by category`;

      return { text: response, type: "categories", data: { totalCategories, totalSubcategories } };
    } catch (error) {
      return {
        text: "I couldn't fetch category data. Please try again.",
        type: "error",
      };
    }
  }

  if (trainedResponses.reports.some((word) => lowerMessage.includes(word))) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todaySales = await Order.aggregate([
        { $match: { date: { $gte: today } } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalPrice" },
            totalOrders: { $sum: 1 },
            totalTax: { $sum: "$totalSalesTax" },
          },
        },
      ]);

      const paymentBreakdown = await Order.aggregate([
        { $match: { date: { $gte: today } } },
        {
          $group: {
            _id: "$paymentMethod",
            count: { $sum: 1 },
            total: { $sum: "$totalPrice" },
          },
        },
      ]);

      let response = `📊 **Today's Report Summary**\n\n`;

      if (todaySales.length > 0) {
        response += `💰 **Revenue Metrics:**\n`;
        response += `• Total Revenue: **Rs ${todaySales[0].totalRevenue}**\n`;
        response += `• Total Orders: **${todaySales[0].totalOrders}**\n`;
        response += `• Total Tax Collected: **Rs ${todaySales[0].totalTax}**\n\n`;
      }

      if (paymentBreakdown.length > 0) {
        response += `💳 **Payment Method Breakdown:**\n`;
        paymentBreakdown.forEach((payment) => {
          response += `• ${payment._id}: ${payment.count} orders, Rs ${payment.total}\n`;
        });
      }

      response += `\n💡 Available Reports:\n• Daily/Weekly/Monthly sales\n• Product performance\n• Tax analysis\n• Customer analytics\n• Cashier performance`;

      return { text: response, type: "reports", data: todaySales[0] };
    } catch (error) {
      return {
        text: "I couldn't generate the report. Please try again.",
        type: "error",
      };
    }
  }

  if (trainedResponses.users.some((word) => lowerMessage.includes(word))) {
    try {
      const totalUsers = await Users.countDocuments();
      const activeUsers = await Users.countDocuments({ active: true });
      const usersByRole = await Users.aggregate([
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ]);

      let response = `👤 **User Management**\n\n`;
      response += `• Total Users: **${totalUsers}**\n`;
      response += `• Active Users: **${activeUsers}**\n\n`;

      if (usersByRole.length > 0) {
        response += `👥 **Users by Role:**\n`;
        usersByRole.forEach((role) => {
          response += `• ${role._id}: **${role.count}**\n`;
        });
      }

      response += `\n💡 User Features:\n• Add/Edit users\n• Role management\n• Permission control\n• Activity tracking`;

      return { text: response, type: "users", data: { totalUsers, activeUsers } };
    } catch (error) {
      return {
        text: "I couldn't fetch user information. Please try again.",
        type: "error",
      };
    }
  }

  if (trainedResponses.tax.some((word) => lowerMessage.includes(word))) {
    return {
      text: `💳 **Tax & HS Code Management**\n\nOur system supports comprehensive tax management:\n\n📋 **Tax Types:**\n• Sales Tax (configurable %)\n• Custom Duty (configurable %)\n• Withholding Tax (configurable %)\n\n🏷️ **HS Code Features:**\n• Format: XXXX.XXXX (8 digits)\n• Category-level codes\n• Subcategory-level codes\n• Product-level codes\n• Tax rate mapping\n\n✅ **Exemptions:**\n• SPO Number tracking\n• Schedule Number\n• Item Number\n\n📊 **Tax Reporting:**\n• Total tax collected\n• Tax breakdown by type\n• HS code-wise analysis\n• Duty calculations\n\n💡 Ask me about:\n• Specific HS codes\n• Tax calculations\n• Exemption details\n• Product tax rates`,
      type: "tax",
    };
  }

  if (lowerMessage.includes("low stock") || lowerMessage.includes("alert")) {
    try {
      const lowStock = await Products.find({ quantity: { $lt: 10 } })
        .limit(10)
        .select("name quantity price");

      let response = `⚠️ **Low Stock Alert**\n\n`;

      if (lowStock.length > 0) {
        response += `Found **${lowStock.length}** products with low stock:\n\n`;
        lowStock.forEach((product, index) => {
          response += `${index + 1}. ${product.name}\n   • Current Stock: **${product.quantity}**\n   • Price: Rs ${product.price}\n\n`;
        });
        response += `🔔 Consider restocking these items soon!`;
      } else {
        response += `✅ All products are well-stocked! No low stock alerts at this time.`;
      }

      return { text: response, type: "alert", data: { lowStockCount: lowStock.length } };
    } catch (error) {
      return {
        text: "I couldn't check stock levels. Please try again.",
        type: "error",
      };
    }
  }

  if (lowerMessage.includes("cashier") || lowerMessage.includes("session")) {
    try {
      const today = new Date().toISOString().split("T")[0];
      const activeSessions = await CashierDailySession.countDocuments({
        sessionDate: today,
        currentlyActive: true,
      });

      const todaySessions = await CashierDailySession.find({
        sessionDate: today,
      }).select("cashierName totalDailySales totalDailyTransactions");

      let response = `👨‍💼 **Cashier Activity Today**\n\n`;
      response += `• Active Sessions: **${activeSessions}**\n`;
      response += `• Total Cashiers Checked In: **${todaySessions.length}**\n\n`;

      if (todaySessions.length > 0) {
        response += `📊 **Today's Performance:**\n`;
        todaySessions.forEach((session, index) => {
          response += `${index + 1}. ${session.cashierName}\n   • Sales: Rs ${session.totalDailySales}\n   • Transactions: ${session.totalDailyTransactions}\n\n`;
        });
      }

      return { text: response, type: "cashier", data: { activeSessions } };
    } catch (error) {
      return {
        text: "I couldn't fetch cashier session data. Please try again.",
        type: "error",
      };
    }
  }

  return {
    text: `I'm here to help! I didn't quite understand that. Here's what I can assist with:\n\n📦 **Products** - Inventory, stock levels, product details\n💰 **Sales** - Orders, revenue, transactions\n👥 **Customers** - Customer info, purchase history\n🏢 **Suppliers** - Supplier management, orders, dues\n📊 **Reports** - Analytics, statistics, insights\n👤 **Users** - Staff management, roles, permissions\n💳 **Tax** - HS codes, tax rates, exemptions\n⚠️ **Alerts** - Low stock, notifications\n\nTry asking something like:\n• "Show me today's sales"\n• "How many products do we have?"\n• "Who are our top customers?"\n• "Check low stock items"\n• "Show supplier information"`,
    type: "fallback",
  };
};

exports.chatWithBot = async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user.userId;

    if (!message || message.trim() === "") {
      return res.status(400).json({ error: "Message is required" });
    }

    const response = await getContextualResponse(message, userId);

    res.status(200).json({
      success: true,
      response: response.text,
      type: response.type,
      data: response.data || null,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("Chatbot error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process your request. Please try again.",
    });
  }
};

exports.getChatHistory = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "Chat history feature coming soon",
      history: [],
    });
  } catch (error) {
    console.error("Chat history error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch chat history" });
  }
};

exports.clearChatHistory = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: "Chat history cleared",
    });
  } catch (error) {
    console.error("Clear chat error:", error);
    res.status(500).json({ success: false, error: "Failed to clear chat history" });
  }
};
