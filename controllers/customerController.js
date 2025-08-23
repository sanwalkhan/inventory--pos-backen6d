const { Customer } = require("../models/customerModel");
const { Products } = require("../models/productModel");
const { Order } = require("../models/orderModel");
const Users = require("../models/userModel")
const bcrypt = require("bcrypt");

// Environment variable or constant password for refund - change secret for production
// bcrypt hash of 'supersecret' for example

// Upsert customer: add a new order or create new customer
const customer = async (req, res) => {
  try {
    const { name, phone, latestOrder } = req.body;

    if (!name || !phone || !latestOrder) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Validate latestOrder format
    if (!Array.isArray(latestOrder.items) || latestOrder.items.length === 0) {
      return res.status(400).json({ error: "Invalid order data" });
    }

    let existingCustomer = await Customer.findOne({ phone });

    if (existingCustomer) {
      existingCustomer.purchaseHistory.push({
        orderDate: latestOrder.orderDate || new Date(),
        items: latestOrder.items,
      });
      existingCustomer.purchaseCount += 1;
      await existingCustomer.save();
      return res.json(existingCustomer);
    } else {
      const newCustomer = await Customer.create({
        name,
        phone,
        purchaseHistory: [
          {
            orderDate: latestOrder.orderDate || new Date(),
            items: latestOrder.items,
          },
        ],
        purchaseCount: 1,
      });
      return res.json(newCustomer);
    }
  } catch (err) {
    console.error("🔥 Customer upsert error:", err);
    res.status(500).json({ error: "Server error while upserting customer" });
  }
};

// Get all customers with basic info
const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find()
      .select("name phone purchaseCount createdAt")
      .sort({ createdAt: -1 });
    res.status(200).json({ customers });
  } catch (err) {
    console.error("Error fetching customers", err);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
};

// Get single customer with full purchaseHistory
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.json(customer);
  } catch (err) {
    console.error("Error fetching customer details", err);
    res.status(500).json({ error: "Failed to fetch customer details" });
  }
};

// Refund controller
// Body: { customerId, orderDate, refundItems: [{ productId, quantity }], password }
const refund = async (req, res) => {
  try {
    const {userId, customerId, orderDate, refundItems, password } = req.body;
    const userdata = await Users.findById(userId);
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

    // 
    const order = await Order.findOne({
      userPhone: customer.phone,
      // small buffer
    });
    if (!order) {
      return res.status(404).json({ error: "Order document not found" });
    }

    // Map items for quick lookup
    const custOrderItemsMap = new Map(custOrder.items.map((item) => [item.productId.toString(), item]));
    const orderItemsMap = new Map(order.items.map((item) => [item.productId.toString(), item]));

    // Validate refund items
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
          error: `Refund quantity exceeds purchased quantity for product ${productId}`,
        });
      }
    }

    // Process refund on both Customer embedded order and Order document
    for (const refundItem of refundItems) {
      const { productId, quantity } = refundItem;

      // Update customer purchaseHistory items
      const custOrderItem = custOrderItemsMap.get(productId);
      custOrderItem.quantity -= quantity;

      if (custOrderItem.quantity === 0) {
        custOrder.items = custOrder.items.filter((i) => i.productId.toString() !== productId);
      }

      // Update Order document items
      const orderItem = orderItemsMap.get(productId);
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

    // Remove empty order from Customer purchaseHistory
    if (custOrder.items.length === 0) {
      customer.purchaseHistory.splice(custOrderIndex, 1);
      customer.purchaseCount = Math.max(0, customer.purchaseCount - 1);
    } else {
      customer.purchaseHistory[custOrderIndex] = custOrder;
    }

    // Mark purchaseHistory modified for mongoose tracking
    customer.markModified("purchaseHistory");

    // Save Customer document
    await customer.save();

    // Optionally, recalculate totalPrice on Order document if you want
    // Example:
    order.totalPrice = order.items.reduce((sum, item) => {
  const price = Number(item.sellingPrice);
  const qty = Number(item.quantity);

  if (isNaN(price) || isNaN(qty)) {
    console.warn(`Invalid price or quantity detected for product ${item.productId}: price=${item.price}, qty=${item.quantity}`);
    return sum; // skip invalid item
  }

  return sum + price * qty;
}, 0);


    // Save Order document
    await order.save();

    return res.json({ message: "Refund processed successfully", customer, order });
  } catch (err) {
    console.error("🔥 Refund processing error:", err);
    return res.status(500).json({ error: "Server error while processing refund" });
  }
};


module.exports = {
  customer,
  getCustomers,
  getCustomerById,
  refund,
};
