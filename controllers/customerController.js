const { Customer } = require("../models/customerModel");
const { Products } = require("../models/productModel");
const { Order } = require("../models/orderModel");
const Users = require("../models/userModel")
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");

// Upsert customer: add a new order or create new customer
const customer = async (req, res) => {
  try {
    const { name, phone, latestOrder } = req.body;
    console.log("📦 Received customer upsert request:", JSON.stringify(req.body, null, 2));

    // ✅ Validate required fields first
    if (!name || !phone || !latestOrder) {
      console.error("❌ Missing required fields");
      return res.status(400).json({ error: "Missing required fields: name, phone, or latestOrder" });
    }

    if (!Array.isArray(latestOrder.items) || latestOrder.items.length === 0) {
      console.error("❌ Invalid items array");
      return res.status(400).json({ error: "latestOrder.items must be a non-empty array" });
    }

    // ✅ Extract cashier info safely from first item OR from latestOrder itself
    const cashierId = latestOrder.cashierId || latestOrder.items[0]?.userId || null;
    let cashierName = latestOrder.cashierName || "Unknown Cashier";
    
    if (cashierId && !latestOrder.cashierName) {
      const cashier = await Users.findById(cashierId).select("username");
      if (cashier) cashierName = cashier.username;
    }

    console.log("👤 Cashier info:", { cashierId, cashierName });

    // ✅ Compute total price if not supplied
    const computedTotal = latestOrder.items.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
      0
    );

    const totalAmount = latestOrder.totalPrice || latestOrder.totalAmount || computedTotal;

    console.log("💰 Order total:", totalAmount);

    // ✅ Build purchase entry
    const purchaseEntry = {
      orderDate: latestOrder.orderDate || new Date(),
      items: latestOrder.items.map(item => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        originalQuantity: item.originalQuantity || item.quantity
      })),
      cashierId,
      cashierName,
      paymentMethod: latestOrder.paymentMethod || "cash",
      totalAmount: totalAmount,
    };

    console.log("📝 Purchase entry:", JSON.stringify(purchaseEntry, null, 2));

    // ✅ Upsert customer
    let existingCustomer = await Customer.findOne({ phone });

    if (existingCustomer) {
      console.log("✅ Existing customer found, updating...");
      existingCustomer.purchaseHistory.push(purchaseEntry);
      existingCustomer.purchaseCount += 1;
      existingCustomer.totalSpent = (existingCustomer.totalSpent || 0) + totalAmount;
      existingCustomer.lastPurchaseDate = purchaseEntry.orderDate;
      await existingCustomer.save();
      
      console.log("✅ Customer updated successfully");
      return res.json(existingCustomer);
    }

    console.log("✅ Creating new customer...");
    const newCustomer = await Customer.create({
      name,
      phone,
      purchaseHistory: [purchaseEntry],
      purchaseCount: 1,
      totalSpent: totalAmount,
      lastPurchaseDate: purchaseEntry.orderDate,
      refundHistory: [],
    });

    console.log("✅ New customer created successfully:", newCustomer._id);
    return res.json(newCustomer);
    
  } catch (err) {
    console.error("🔥 Customer upsert error:", err);
    console.error("Error stack:", err.stack);
    
    if (err.name === 'ValidationError') {
      console.error("Validation errors:", err.errors);
      return res.status(400).json({ 
        error: "Validation failed", 
        details: Object.keys(err.errors).map(key => ({
          field: key,
          message: err.errors[key].message
        }))
      });
    }
    
    res.status(500).json({ 
      error: "Server error while upserting customer",
      message: err.message 
    });
  }
};


// Get all customers with pagination
const getCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const skip = (page - 1) * limit;

    const totalCustomers = await Customer.countDocuments();
    const totalPages = Math.ceil(totalCustomers / limit);

    const customers = await Customer.find()
      .select("name phone purchaseCount totalSpent lastPurchaseDate createdAt purchaseHistory")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({ 
      customers,
      pagination: {
        currentPage: page,
        totalPages,
        totalCustomers,
        hasNext: page < totalPages,
        hasPrev: page > 1,
        limit
      }
    });
  } catch (err) {
    console.error("Error fetching customers", err);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
};

// Get single customer with full purchaseHistory and refundHistory
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    
    // Ensure refundHistory exists (for backward compatibility)
    if (!customer.refundHistory) {
      customer.refundHistory = [];
    }

    // Ensure all purchase history items have required fields
    if (customer.purchaseHistory) {
      customer.purchaseHistory = customer.purchaseHistory.map(order => ({
        ...order.toObject(),
        cashierId: order.cashierId || null,
        cashierName: order.cashierName || "Unknown Cashier",
        paymentMethod: order.paymentMethod || "cash",
        totalAmount: order.totalAmount || order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0
      }));
    }
    
    res.json(customer);
  } catch (err) {
    console.error("Error fetching customer details", err);
    res.status(500).json({ error: "Failed to fetch customer details" });
  }
};

// Enhanced refund controller with proper tracking
const refund = async (req, res) => {
  try {
    const { userId, customerId, orderDate, refundItems, password, reason = "Customer request" } = req.body;
    
    // FIX: Handle both ObjectId and string identifiers for users
    let userdata;
    if (mongoose.Types.ObjectId.isValid(userId)) {
      userdata = await Users.findById(userId);
    } else {
      userdata = await Users.findOne({
        $or: [
          { username: userId },
          { email: userId },
          { adminId: userId }
        ]
      });
    }

    if (!userdata) {
      return res.status(404).json({ error: "User not found" });
    }

    const hashedpwd = userdata.refundPassword;

    if (
      !customerId ||
      !orderDate ||
      !refundItems ||
      !Array.isArray(refundItems) ||
      refundItems.length === 0 ||
      !password
    ) {
      return res.status(400).json({ error: "Missing or invalid refund data" });
    }

    if (!hashedpwd) {
      return res.status(500).json({ error: "Refund password not configured" });
    }

    // Verify refund password
    const isPasswordValid = await bcrypt.compare(password, hashedpwd);
    if (!isPasswordValid) {
      return res.status(403).json({ error: "Invalid password for refund" });
    }

    // Fetch Customer document
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Safer date comparison
    const targetOrderDate = new Date(orderDate).getTime();

    // Find embedded order in Customer.purchaseHistory
    const custOrderIndex = customer.purchaseHistory.findIndex(
      (order) => new Date(order.orderDate).getTime() === targetOrderDate
    );
    if (custOrderIndex === -1) {
      return res.status(404).json({ error: "Order not found in customer history" });
    }
    const custOrder = customer.purchaseHistory[custOrderIndex];

    // Find corresponding Order document
    const order = await Order.findOne({
      userPhone: customer.phone,
      date: {
        $gte: new Date(targetOrderDate - 60000), // 1 minute buffer
        $lte: new Date(targetOrderDate + 60000)
      }
    });

    if (!order) {
      return res.status(404).json({ error: "Order document not found" });
    }

    // Map items for quick lookup
    const custOrderItemsMap = new Map(custOrder.items.map((item) => [item.productId.toString(), item]));
    const orderItemsMap = new Map(order.items.map((item) => [item.productId.toString(), item]));

    // Validate refund items and calculate totals
    let totalRefundAmount = 0;
    const validatedRefundItems = [];

    for (const refundItem of refundItems) {
      const { productId, quantity } = refundItem;

      if (!productId || !quantity || quantity <= 0) {
        return res.status(400).json({ error: "Invalid refund item data" });
      }

      const custOrderItem = custOrderItemsMap.get(productId);
      const orderItem = orderItemsMap.get(productId);

      if (!custOrderItem || !orderItem) {
        return res.status(400).json({ error: `Product ${productId} not found in order` });
      }
      if (quantity > custOrderItem.quantity || quantity > orderItem.quantity) {
        return res.status(400).json({
          error: `Refund quantity exceeds available quantity for product ${productId}`,
        });
      }

      const refundItemTotal = custOrderItem.price * quantity;
      totalRefundAmount += refundItemTotal;

      // FIX: Include all required fields for refund items
      validatedRefundItems.push({
        productId,
        name: custOrderItem.name,
        originalQuantity: custOrderItem.originalQuantity || custOrderItem.quantity,
        refundedQuantity: quantity,
        unitPrice: custOrderItem.price,
        totalRefundAmount: refundItemTotal,
        // Include fields that might be required by your schema
        hsCode: custOrderItem.hsCode || orderItem.hsCode || "N/A", // Get from original items
        category: custOrderItem.category || orderItem.category || "Uncategorized",
        barcode: custOrderItem.barcode || orderItem.barcode || "",
        sellingPrice: custOrderItem.price, // Use same price as unitPrice for consistency
        // Include any other fields that might be required
        ...(custOrderItem.hsCode && { hsCode: custOrderItem.hsCode }),
        ...(orderItem.hsCode && { hsCode: orderItem.hsCode })
      });
    }

    // FIX: Create complete refund history entry with all required fields
    const refundEntry = {
      refundDate: new Date(),
      refundedBy: userdata._id ? userdata._id.toString() : userId, // Use proper ID
      refundedByName: userdata.name || userdata.username || "Admin",
      orderDate: custOrder.orderDate,
      cashierName: custOrder.cashierName || "Unknown Cashier",
      items: validatedRefundItems,
      totalRefundAmount,
      reason,
      originalOrderTotal: custOrder.totalAmount || custOrder.items.reduce((total, item) => total + item.price * item.quantity, 0),
      // Include additional fields that might be required
      orderId: order._id,
      customerId: customer._id,
      customerName: customer.name,
      customerPhone: customer.phone
    };

    // Process refund on both Customer embedded order and Order document
    for (const refundItem of refundItems) {
      const { productId, quantity } = refundItem;

      // Update customer purchaseHistory items
      const custOrderItem = custOrderItemsMap.get(productId);
      if (!custOrderItem.originalQuantity) {
        custOrderItem.originalQuantity = custOrderItem.quantity;
      }
      custOrderItem.quantity -= quantity;

      if (custOrderItem.quantity === 0) {
        custOrder.items = custOrder.items.filter((i) => i.productId.toString() !== productId);
      }

      // Update Order document items
      const orderItem = orderItemsMap.get(productId);
      if (!orderItem.originalQuantity) {
        orderItem.originalQuantity = orderItem.quantity + quantity;
      }
      orderItem.quantity -= quantity;

      if (orderItem.quantity === 0) {
        order.items = order.items.filter((i) => i.productId.toString() !== productId);
      }

      // Update product stock quantity
      const product = await Products.findById(productId);
      if (!product) {
        return res.status(404).json({ error: `Product ${productId} not found in inventory` });
      }
      product.quantity += quantity;
      await product.save();
    }

    // Update totals and status
    custOrder.totalAmount = (custOrder.totalAmount || 0) - totalRefundAmount;
    customer.totalSpent = (customer.totalSpent || 0) - totalRefundAmount;

    // Initialize refundHistory if it doesn't exist (backward compatibility)
    if (!customer.refundHistory) {
      customer.refundHistory = [];
    }
    
    // Add refund history to customer
    customer.refundHistory.push(refundEntry);

    // Remove empty order from Customer purchaseHistory
    if (custOrder.items.length === 0) {
      customer.purchaseHistory.splice(custOrderIndex, 1);
      customer.purchaseCount = Math.max(0, customer.purchaseCount - 1);
    } else {
      customer.purchaseHistory[custOrderIndex] = custOrder;
    }

    // Mark fields as modified for mongoose tracking
    customer.markModified("purchaseHistory");
    customer.markModified("refundHistory");

    // Update Order document
    if (!order.originalTotalPrice) {
      order.originalTotalPrice = order.totalPrice;
    }
    
    order.totalPrice = order.items.reduce((sum, item) => {
      const price = Number(item.sellingPrice);
      const qty = Number(item.quantity);

      if (isNaN(price) || isNaN(qty)) {
        console.warn(`Invalid price or quantity detected for product ${item.productId}: price=${item.sellingPrice}, qty=${item.quantity}`);
        return sum;
      }

      return sum + price * qty;
    }, 0);

    order.totalRefunded = (order.totalRefunded || 0) + totalRefundAmount;
    
    // Update order status
    if (order.totalPrice === 0) {
      order.status = "fully_refunded";
    } else if (order.totalRefunded > 0) {
      order.status = "partially_refunded";
    }

    // Add refund history to order
    if (!order.refundHistory) {
      order.refundHistory = [];
    }
    
    // FIX: Ensure order refund entry has all required fields
    const orderRefundEntry = {
      ...refundEntry,
      // Ensure items have all required schema fields
      items: validatedRefundItems.map(item => ({
        ...item,
        // Make sure hsCode is always provided
        hsCode: item.hsCode || "N/A"
      }))
    };
    
    order.refundHistory.push(orderRefundEntry);

    // Save both documents with error handling
    try {
      await customer.save();
      await order.save();
    } catch (saveError) {
      console.error("Save error details:", saveError.errors);
      throw saveError;
    }

    return res.json({ 
      message: "Refund processed successfully", 
      refundDetails: {
        totalRefunded: totalRefundAmount,
        refundedItems: validatedRefundItems.length,
        refundDate: refundEntry.refundDate,
        processedBy: refundEntry.refundedByName
      }
    });
  } catch (err) {
    console.error("🔥 Refund processing error:", err);
    
    // More detailed error logging
    if (err.name === 'ValidationError') {
      console.error("Validation errors:", err.errors);
      return res.status(400).json({ 
        error: "Validation failed", 
        details: Object.keys(err.errors).map(key => ({
          field: key,
          message: err.errors[key].message
        }))
      });
    }
    
    return res.status(500).json({ error: "Server error while processing refund" });
  }
};

// Get refund history for a customer
const getRefundHistory = async (req, res) => {
  try {
    const { customerId } = req.params;
    const customer = await Customer.findById(customerId).select('refundHistory name phone');
    
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({
      customerInfo: {
        name: customer.name,
        phone: customer.phone
      },
      refundHistory: customer.refundHistory || []
    });
  } catch (err) {
    console.error("Error fetching refund history", err);
    res.status(500).json({ error: "Failed to fetch refund history" });
  }
};

module.exports = {
  customer,
  getCustomers,
  getCustomerById,
  refund,
  getRefundHistory,
};