const { Customer } = require("../models/customerModel");

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

module.exports = {
  customer,
  getCustomers,
  getCustomerById,
};
