const Supplier = require('../models/supplierModel');
const { Products } = require('../models/productModel');
const mongoose = require('mongoose');

// ✅ Create new supplier
exports.createSupplier = async (req, res) => {
  try {
    const { name, email, mobile, address } = req.body;
    console.log("📩 Incoming supplier body:", req.body);

    // Basic field validation
    if (!name || !email || !mobile || !address) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // ✅ Field constraints
    if (name.length > 100) return res.status(400).json({ error: "Name must be 100 characters or less" });
    if (email.length > 100) return res.status(400).json({ error: "Email must be 100 characters or less" });
    if (!/^\d{1,14}$/.test(mobile)) return res.status(400).json({ error: "Mobile number must contain up to 14 digits" });
    if (address.length > 250) return res.status(400).json({ error: "Address must be 250 characters or less" });

    const existingSupplier = await Supplier.findOne({ email });
    const existingPhone = await Supplier.findOne({ mobile });

    if (existingSupplier || existingPhone) {
      return res.status(400).json({ error: "Supplier with this email or phone already exists" });
    }

    const supplier = new Supplier({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      mobile: mobile.trim(),
      address: address.trim()
    });

    await supplier.save();
    res.status(201).json({ message: "Supplier created successfully", supplier });
  } catch (err) {
    console.error("❌ Supplier creation error:", err);
    if (err.code === 11000) {
      return res.status(400).json({ error: "Supplier with this email already exists" });
    }
    if (err.name === "ValidationError") {
      const messages = Object.values(err.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get all suppliers (search + pagination)
exports.getSuppliers = async (req, res) => {
  try {
    const { search, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (page - 1) * limit;
    const query = { isActive: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } }
      ];
    }

    const suppliers = await Supplier.find(query)
      .populate('orders.items.productId', 'name barcode')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Supplier.countDocuments(query);

    res.json({
      suppliers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get single supplier by ID
exports.getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id)
      .populate('orders.items.productId', 'name barcode price');
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Update supplier
exports.updateSupplier = async (req, res) => {
  try {
    const { name, email, mobile, address } = req.body;
    const supplierId = req.params.id;

    const updateData = {};
    if (name) {
      if (name.length > 100) return res.status(400).json({ error: "Name must be 100 characters or less" });
      updateData.name = name.trim();
    }
    if (email) {
      if (email.length > 100) return res.status(400).json({ error: "Email must be 100 characters or less" });
      const existingSupplier = await Supplier.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: supplierId }
      });
      if (existingSupplier) {
        return res.status(400).json({ error: 'Another supplier with this email already exists' });
      }
      updateData.email = email.toLowerCase().trim();
    }
    if (mobile) {
      if (!/^\d{1,14}$/.test(mobile)) return res.status(400).json({ error: "Mobile number must contain up to 14 digits" });
      updateData.mobile = mobile.trim();
    }
    if (address !== undefined) {
      if (address.length > 250) return res.status(400).json({ error: "Address must be 250 characters or less" });
      updateData.address = address.trim();
    }

    const supplier = await Supplier.findByIdAndUpdate(
      supplierId, updateData, { new: true, runValidators: true }
    );

    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    res.json({ message: 'Supplier updated successfully', supplier });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Supplier with this email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
};

// ✅ Soft delete supplier
exports.deleteSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id, { isActive: false }, { new: true }
    );
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    res.json({ message: 'Supplier deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Add new order
exports.addOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id: supplierId } = req.params;
    const { orderId, items, paidAmount, notes } = req.body;

    const supplier = await Supplier.findById(supplierId).session(session);
    if (!supplier) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Supplier not found' });
    }

    if (supplier.orders.find(order => order.orderId === orderId)) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Order ID already exists for this supplier' });
    }

    const processedItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const product = await Products.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ error: `Product not found: ${item.productId}` });
      }

      // ✅ Restrict product order quantity to 500 max
      if (item.quantity > 500) {
        await session.abortTransaction();
        return res.status(400).json({ error: `Cannot order more than 500 units for ${product.name}` });
      }

      const itemTotal = item.quantity * item.unitPrice;
      processedItems.push({
        productId: item.productId,
        productName: product.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: itemTotal,
        receivedQuantity: 0,
        isFullyReceived: false
      });

      totalAmount += itemTotal;
    }

    const dueAmount = totalAmount - (paidAmount || 0);

    supplier.orders.push({
      orderId,
      items: processedItems,
      totalAmount,
      paidAmount: paidAmount || 0,
      dueAmount,
      notes: notes?.trim(),
      status: 'pending'
    });

    await supplier.save({ session });
    await session.commitTransaction();

    const updatedSupplier = await Supplier.findById(supplierId)
      .populate('orders.items.productId', 'name barcode');

    res.status(201).json({ message: 'Order added successfully', supplier: updatedSupplier });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

// ✅ Update order payment
exports.updateOrderPayment = async (req, res) => {
  try {
    const { supplierId, orderId } = req.params;
    const { paidAmount } = req.body;

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const order = supplier.orders.id(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (paidAmount < 0 || paidAmount > order.totalAmount) {
      return res.status(400).json({ error: 'Invalid paid amount' });
    }

    order.paidAmount = paidAmount;
    order.dueAmount = order.totalAmount - paidAmount;
    await supplier.save();

    res.json({ message: 'Order payment updated successfully', supplier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Receive products
exports.receiveProducts = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { supplierId, orderId } = req.params;
    const { receivedItems } = req.body;

    const supplier = await Supplier.findById(supplierId).session(session);
    if (!supplier) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const order = supplier.orders.id(orderId);
    if (!order) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Order not found' });
    }

    for (const receivedItem of receivedItems) {
      const orderItem = order.items.id(receivedItem.itemId);
      if (!orderItem) {
        await session.abortTransaction();
        return res.status(404).json({ error: `Order item not found: ${receivedItem.itemId}` });
      }

      const newReceivedQty = orderItem.receivedQuantity + receivedItem.receivedQuantity;
      if (newReceivedQty > orderItem.quantity) {
        await session.abortTransaction();
        return res.status(400).json({ error: `Cannot receive more than ordered quantity for ${orderItem.productName}` });
      }

      await Products.findByIdAndUpdate(
        orderItem.productId,
        { $inc: { quantity: receivedItem.receivedQuantity } },
        { session }
      );

      orderItem.receivedQuantity = newReceivedQty;
      orderItem.isFullyReceived = newReceivedQty === orderItem.quantity;
    }

    const allItemsFullyReceived = order.items.every(i => i.isFullyReceived);
    const someItemsReceived = order.items.some(i => i.receivedQuantity > 0);

    if (allItemsFullyReceived) {
      order.status = 'fully_received';
      order.isFullyReceived = true;
      order.receivedDate = new Date();
    } else if (someItemsReceived) {
      order.status = 'partially_received';
    }

    await supplier.save({ session });
    await session.commitTransaction();

    const updatedSupplier = await Supplier.findById(supplierId)
      .populate('orders.items.productId', 'name barcode');

    res.json({ message: 'Products received successfully', supplier: updatedSupplier });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

// ✅ Clear all dues
exports.clearAllDues = async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await Supplier.findById(id);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    supplier.orders.forEach(order => {
      order.paidAmount = order.totalAmount;
      order.dueAmount = 0;
    });

    await supplier.save();
    res.json({ message: 'All dues cleared successfully', supplier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Get supplier purchase history
exports.getSupplierHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, status } = req.query;

    const supplier = await Supplier.findById(id)
      .populate('orders.items.productId', 'name barcode price');
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    let orders = supplier.orders;

    if (startDate || endDate) {
      orders = orders.filter(o => {
        const d = new Date(o.orderDate);
        return (!startDate || d >= new Date(startDate)) &&
               (!endDate || d <= new Date(endDate));
      });
    }

    if (status) orders = orders.filter(o => o.status === status);

    const summary = {
      totalOrders: orders.length,
      totalAmount: orders.reduce((a, o) => a + o.totalAmount, 0),
      totalPaid: orders.reduce((a, o) => a + o.paidAmount, 0),
      totalDue: orders.reduce((a, o) => a + o.dueAmount, 0),
      statusBreakdown: {
        pending: orders.filter(o => o.status === 'pending').length,
        partially_received: orders.filter(o => o.status === 'partially_received').length,
        fully_received: orders.filter(o => o.status === 'fully_received').length
      }
    };

    res.json({
      supplier: {
        _id: supplier._id,
        name: supplier.name,
        email: supplier.email,
        mobile: supplier.mobile
      },
      orders: orders.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate)),
      summary
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ Delete specific order
exports.deleteOrder = async (req, res) => {
  try {
    const { supplierId, orderId } = req.params;
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

    const orderIndex = supplier.orders.findIndex(o => o._id.toString() === orderId);
    if (orderIndex === -1) return res.status(404).json({ error: 'Order not found' });

    supplier.orders.splice(orderIndex, 1);
    await supplier.save();

    res.json({ message: 'Order deleted successfully', supplier });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
