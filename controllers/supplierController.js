const Supplier = require('../models/supplierModel');
const { Products } = require('../models/productModel');
const mongoose = require('mongoose');

// Create new supplier
exports.createSupplier = async (req, res) => {
  try {
    const { name, email, mobile, address } = req.body;
    
    // Check if supplier with email already exists
    const existingSupplier = await Supplier.findOne({ email });
    if (existingSupplier) {
      return res.status(400).json({ 
        error: 'Supplier with this email already exists' 
      });
    }

    const supplier = new Supplier({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      mobile: mobile.trim(),
      address: address?.trim()
    });

    await supplier.save();
    res.status(201).json({
      message: 'Supplier created successfully',
      supplier
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ 
        error: 'Supplier with this email already exists' 
      });
    }
    res.status(400).json({ error: err.message });
  }
};

// Get all suppliers with optional search and pagination
exports.getSuppliers = async (req, res) => {
  try {
    const { search, page = 1, limit = 10, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    let query = { isActive: true };
    
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

// Get single supplier by ID
exports.getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id)
      .populate('orders.items.productId', 'name barcode price');
    
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json(supplier);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update supplier
exports.updateSupplier = async (req, res) => {
  try {
    const { name, email, mobile, address } = req.body;
    const supplierId = req.params.id;

    // Check if email is being changed and if it's already taken by another supplier
    if (email) {
      const existingSupplier = await Supplier.findOne({ 
        email: email.toLowerCase().trim(),
        _id: { $ne: supplierId }
      });
      
      if (existingSupplier) {
        return res.status(400).json({ 
          error: 'Another supplier with this email already exists' 
        });
      }
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.toLowerCase().trim();
    if (mobile) updateData.mobile = mobile.trim();
    if (address !== undefined) updateData.address = address?.trim();

    const supplier = await Supplier.findByIdAndUpdate(
      supplierId,
      updateData,
      { new: true, runValidators: true }
    );

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json({
      message: 'Supplier updated successfully',
      supplier
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ 
        error: 'Supplier with this email already exists' 
      });
    }
    res.status(400).json({ error: err.message });
  }
};

// Soft delete supplier
exports.deleteSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json({ message: 'Supplier deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add new order to supplier
exports.addOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id: supplierId } = req.params;
    const { orderId, items, paidAmount, notes } = req.body;

    // Validate supplier exists
    const supplier = await Supplier.findById(supplierId).session(session);
    if (!supplier) {
      await session.abortTransaction();
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Check if order ID already exists for this supplier
    const existingOrder = supplier.orders.find(order => order.orderId === orderId);
    if (existingOrder) {
      await session.abortTransaction();
      return res.status(400).json({ error: 'Order ID already exists for this supplier' });
    }

    // Validate and process items
    const processedItems = [];
    let totalAmount = 0;

    for (const item of items) {
      const product = await Products.findById(item.productId).session(session);
      if (!product) {
        await session.abortTransaction();
        return res.status(404).json({ 
          error: `Product not found: ${item.productId}` 
        });
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

    // Create new order
    const newOrder = {
      orderId,
      items: processedItems,
      totalAmount,
      paidAmount: paidAmount || 0,
      dueAmount,
      notes: notes?.trim(),
      status: 'pending'
    };

    supplier.orders.push(newOrder);
    await supplier.save({ session });

    await session.commitTransaction();

    const updatedSupplier = await Supplier.findById(supplierId)
      .populate('orders.items.productId', 'name barcode');

    res.status(201).json({
      message: 'Order added successfully',
      supplier: updatedSupplier
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

// Update order payment
exports.updateOrderPayment = async (req, res) => {
  try {
    const { supplierId, orderId } = req.params;
    const { paidAmount } = req.body;

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const order = supplier.orders.id(orderId);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (paidAmount < 0 || paidAmount > order.totalAmount) {
      return res.status(400).json({ 
        error: 'Invalid paid amount' 
      });
    }

    order.paidAmount = paidAmount;
    order.dueAmount = order.totalAmount - paidAmount;

    await supplier.save();

    res.json({
      message: 'Order payment updated successfully',
      supplier
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Receive products (update inventory and mark as received)
exports.receiveProducts = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { supplierId, orderId } = req.params;
    const { receivedItems } = req.body; // Array of { itemId, receivedQuantity }

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

    // Process each received item
    for (const receivedItem of receivedItems) {
      const orderItem = order.items.id(receivedItem.itemId);
      if (!orderItem) {
        await session.abortTransaction();
        return res.status(404).json({ 
          error: `Order item not found: ${receivedItem.itemId}` 
        });
      }

      const newReceivedQty = orderItem.receivedQuantity + receivedItem.receivedQuantity;
      
      if (newReceivedQty > orderItem.quantity) {
        await session.abortTransaction();
        return res.status(400).json({ 
          error: `Cannot receive more than ordered quantity for ${orderItem.productName}` 
        });
      }

      // Update product inventory
      await Products.findByIdAndUpdate(
        orderItem.productId,
        { $inc: { quantity: receivedItem.receivedQuantity } },
        { session }
      );

      // Update order item
      orderItem.receivedQuantity = newReceivedQty;
      orderItem.isFullyReceived = newReceivedQty === orderItem.quantity;
    }

    // Update order status
    const allItemsFullyReceived = order.items.every(item => item.isFullyReceived);
    const someItemsReceived = order.items.some(item => item.receivedQuantity > 0);

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

    res.json({
      message: 'Products received successfully',
      supplier: updatedSupplier
    });
  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

// Clear all dues for supplier
exports.clearAllDues = async (req, res) => {
  try {
    const { id } = req.params;
    const supplier = await Supplier.findById(id);
    
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    // Update all orders to be fully paid
    supplier.orders.forEach(order => {
      order.paidAmount = order.totalAmount;
      order.dueAmount = 0;
    });

    await supplier.save();

    res.json({ 
      message: 'All dues cleared successfully', 
      supplier 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get supplier purchase history
exports.getSupplierHistory = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, status } = req.query;

    const supplier = await Supplier.findById(id)
      .populate('orders.items.productId', 'name barcode price');

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    let orders = supplier.orders;

    // Filter by date range
    if (startDate || endDate) {
      orders = orders.filter(order => {
        const orderDate = new Date(order.orderDate);
        if (startDate && orderDate < new Date(startDate)) return false;
        if (endDate && orderDate > new Date(endDate)) return false;
        return true;
      });
    }

    // Filter by status
    if (status) {
      orders = orders.filter(order => order.status === status);
    }

    // Calculate summary
    const summary = {
      totalOrders: orders.length,
      totalAmount: orders.reduce((sum, order) => sum + order.totalAmount, 0),
      totalPaid: orders.reduce((sum, order) => sum + order.paidAmount, 0),
      totalDue: orders.reduce((sum, order) => sum + order.dueAmount, 0),
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

// Delete specific order
exports.deleteOrder = async (req, res) => {
  try {
    const { supplierId, orderId } = req.params;

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const orderIndex = supplier.orders.findIndex(order => order._id.toString() === orderId);
    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Remove the order
    supplier.orders.splice(orderIndex, 1);
    await supplier.save();

    res.json({
      message: 'Order deleted successfully',
      supplier
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};