const { Products } = require("../models/productModel");
const cloudinary = require("cloudinary").v2;
const { Order } = require('../models/orderModel');

// Helper: Calculate selling prices with discount
function calculateSellingPrices({
  price,
  saleTax = 0,
  withholdingTax = 0,
  gst = 0,
  margin = 12,
  discount = 0,
}) {
  // Convert inputs to floats
  price = parseFloat(price);
  saleTax = parseFloat(saleTax);
  withholdingTax = parseFloat(withholdingTax);
  gst = parseFloat(gst);
  margin = parseFloat(margin);
  discount = parseFloat(discount);

  // Calculate tax amounts
  const saleTaxAmount = (price * saleTax) / 100;
  const withholdingTaxAmount = (price * withholdingTax) / 100;
  const gstAmount = (price * gst) / 100;
  const marginAmount = (price * margin) / 100;

  // Selling price without discount (cost + taxes + margin)
  const sellingPriceWithoutDiscount = price + saleTaxAmount + gstAmount + withholdingTaxAmount + marginAmount;
  
  // Apply discount to get final selling price
  const discountAmount = (sellingPriceWithoutDiscount * discount) / 100;
  const sellingPrice = sellingPriceWithoutDiscount - discountAmount;

  return {
    sellingPriceWithoutDiscount: Number(sellingPriceWithoutDiscount.toFixed(2)),
    sellingPrice: Number(sellingPrice.toFixed(2))
  };
}

// Get all products with pagination
const getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const search = req.query.search || '';
    const categoryId = req.query.categoryId || '';
    const subcategoryId = req.query.subcategoryId || '';
    const sortBy = req.query.sortBy || 'name';
    const sortOrder = req.query.sortOrder || 'asc';

    // Build filter object
    const filter = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (categoryId) {
      filter.categoryId = categoryId;
    }
    
    if (subcategoryId) {
      filter.subcategoryId = subcategoryId;
    }

    // Build sort object
    const sort = {};
    if (sortBy === 'price') {
      sort.sellingPrice = sortOrder === 'asc' ? 1 : -1;
    } else if (sortBy === 'quantity') {
      sort.quantity = sortOrder === 'asc' ? 1 : -1;
    } else {
      sort.name = sortOrder === 'asc' ? 1 : -1;
    }

    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalProducts = await Products.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    // Get products with pagination
    const products = await Products.find(filter)
      .populate("categoryId", "categoryName")
      .populate("subcategoryId", "subcategoryName")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      message: "Products retrieved successfully",
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit
      }
    });
  } catch (error) {
    console.error("Error retrieving products:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Add product with enhanced price calculation
const addProduct = async (req, res) => {
  try {
    const {
      name,
      quantity,
      price,
      barcode,
      categoryId,
      subcategoryId,
      description,
      saleTax = 0,
      withholdingTax = 0,
      gst = 0,
      discount = 0,
    } = req.body;

    if (!name || !description || !quantity || !price || !barcode || !categoryId || !subcategoryId || !req.file) {
      return res.status(400).json({ message: "All fields including image are required" });
    }

    const normalizedBarcode = barcode.trim().toLowerCase();
    const normalizedName = name.trim().toLowerCase();

    // Duplicate barcode check
    const existingBarcode = await Products.findOne({ barcode: normalizedBarcode });
    if (existingBarcode) {
      return res.status(409).json({ message: "Product with this barcode already exists." });
    }

    // Duplicate name check (case-insensitive)
    const existingName = await Products.findOne({
      name: { $regex: new RegExp(`^${normalizedName}$`, "i") },
    });
    if (existingName) {
      return res.status(409).json({ message: "Product with this name already exists." });
    }

    // Calculate selling prices
    const { sellingPriceWithoutDiscount, sellingPrice } = calculateSellingPrices({
      price,
      saleTax,
      withholdingTax,
      gst,
      margin: 12, // fixed margin %
      discount,
    });

    const product = new Products({
      name: name.trim(),
      quantity: parseInt(quantity),
      price: parseFloat(price),
      barcode: normalizedBarcode,
      categoryId,
      subcategoryId,
      description,
      saleTax: parseFloat(saleTax),
      withholdingTax: parseFloat(withholdingTax),
      gst: parseFloat(gst),
      discount: parseFloat(discount),
      marginPercent: 12,
      sellingPriceWithoutDiscount,
      sellingPrice,
      image: req.file.path,
      imagePublicId: req.file.filename,
    });

    await product.save();
    res.status(201).json({ message: "Product created successfully", product });
  } catch (error) {
    console.error("Error adding product:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Update product with enhanced price calculation
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      quantity,
      price,
      barcode,
      categoryId,
      subcategoryId,
      description,
      saleTax = 0,
      withholdingTax = 0,
      gst = 0,
      discount = 0,
    } = req.body;

    if (!name || !description || !quantity || !price || !barcode || !categoryId || !subcategoryId) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const product = await Products.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const normalizedBarcode = barcode.trim().toLowerCase();
    const normalizedName = name.trim().toLowerCase();

    // Duplicate barcode check excluding this product
    const duplicateBarcode = await Products.findOne({
      _id: { $ne: id },
      barcode: normalizedBarcode,
    });
    if (duplicateBarcode) {
      return res.status(409).json({ message: "Another product with this barcode already exists." });
    }

    // Duplicate name check excluding this product (case-insensitive)
    const duplicateName = await Products.findOne({
      _id: { $ne: id },
      name: { $regex: new RegExp(`^${normalizedName}$`, "i") },
    });
    if (duplicateName) {
      return res.status(409).json({ message: "Another product with this name already exists." });
    }

    // Calculate selling prices
    const { sellingPriceWithoutDiscount, sellingPrice } = calculateSellingPrices({
      price,
      saleTax,
      withholdingTax,
      gst,
      margin: 12,
      discount,
    });

    const updateData = {
      name: name.trim(),
      quantity: parseInt(quantity),
      price: parseFloat(price),
      barcode: normalizedBarcode,
      categoryId,
      subcategoryId,
      description,
      saleTax: parseFloat(saleTax),
      withholdingTax: parseFloat(withholdingTax),
      gst: parseFloat(gst),
      discount: parseFloat(discount),
      marginPercent: 12,
      sellingPriceWithoutDiscount,
      sellingPrice,
    };

    if (req.file) {
      if (product.imagePublicId) {
        await cloudinary.uploader.destroy(product.imagePublicId);
      }
      updateData.image = req.file.path;
      updateData.imagePublicId = req.file.filename;
    }

    const updatedProduct = await Products.findByIdAndUpdate(id, updateData, { new: true });

    res.status(200).json({ message: "Product updated successfully", product: updatedProduct });
  } catch (error) {
    console.error("Error updating product:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete product
const deleteProduct = async (req, res) => {
  try {
    const product = await Products.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    if (product.imagePublicId) {
      await cloudinary.uploader.destroy(product.imagePublicId);
    }

    await Products.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "Product deleted successfully", product });
  } catch (error) {
    console.error("Error deleting product:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Get by subcategory (query param) with pagination
const getProductsBySubCategory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const subcategoryId = req.query.subcategory;

    const filter = {};
    if (subcategoryId) {
      filter.subcategoryId = subcategoryId;
    }

    const skip = (page - 1) * limit;
    const totalProducts = await Products.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Products.find(filter)
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName")
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit
      }
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Get by subcategory (URL param) with pagination
const getProductsModel = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;
    const subcategoryId = req.params.subcategoryId;

    const filter = {};
    if (subcategoryId) {
      filter.subcategoryId = subcategoryId;
    }

    const skip = (page - 1) * limit;
    const totalProducts = await Products.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Products.find(filter)
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName")
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit
      }
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const getproductByname = async (req, res) => {
  try {
    const { name } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;

    if (!name) {
      return res.status(400).json({ message: "Product name is required" });
    }

    const filter = {
      name: { $regex: name, $options: "i" }
    };

    const skip = (page - 1) * limit;
    const totalProducts = await Products.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Products.find(filter)
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName")
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit
      }
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getProductBycategory = async (req, res) => {
  try {
    const { categoryId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 8;

    if (!categoryId) {
      return res.status(400).json({ message: "Category id is required" });
    }

    const filter = { categoryId: categoryId };

    const skip = (page - 1) * limit;
    const totalProducts = await Products.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    const products = await Products.find(filter)
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName")
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit
      }
    });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getProductByBarcode = async (req, res) => {
  try {
    const { barcode } = req.query;
    if (!barcode) {
      return res.status(400).json({ message: "Barcode is required" });
    }

    const normalizedBarcode = barcode.trim().toLowerCase();
    const product = await Products.find({ 
      barcode: { $regex: `^${normalizedBarcode}$`, $options: "i" }
    })
    .populate("subcategoryId", "subcategoryName")
    .populate("categoryId", "categoryName");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.status(200).json({ product });
  } catch (error) {
    console.error("Error fetching product by barcode:", error.message);
    res.status(500).json({ message: "Failed to fetch product" });
  }
};

const getProductWithStock = async (req, res) => {
  try {
    const products = await Products.find({ quantity: { $gt: 0 } });
    if (!products) {
      return res.status(404).json({ message: "No products found" });
    }
    res.status(200).json({ products });
  } catch (error) {
    console.error("Error fetching products:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

const countEachProductOrder = async (req, res) => {
  try {
    const allProducts = await Products.find().lean();
    const allOrders = await Order.find().lean();

    const productOrderCountMap = {};

    allOrders.forEach((order) => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const productId = item.productId?.toString();
          const quantity = item.quantity || 0;
          if (!productId) return;

          if (!productOrderCountMap[productId]) {
            productOrderCountMap[productId] = 0;
          }
          productOrderCountMap[productId] += quantity;
        });
      }
    });

    const productsWithSellingCount = allProducts.map((product) => ({
      _id: product._id,
      name: product.name,
      price: product.price,
      quantity: product.quantity,
      sellingCount: productOrderCountMap[product._id.toString()] || 0,
      barcode: product.barcode,
      description: product.description,
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId,
      image: product.image,
      saleTax: product.saleTax,
      gst: product.gst,
      withholdingTax: product.withholdingTax,
      discount: product.discount,
      sellingPriceWithoutDiscount: product.sellingPriceWithoutDiscount,
      sellingPrice: product.sellingPrice,
    }));

    res.json(productsWithSellingCount);
  } catch (error) {
    console.error("Error counting each product orders:", error);
    res.status(500).json({ message: "Failed to get product selling counts" });
  }
};
module.exports = {
  getProducts,
  addProduct,
  deleteProduct,
  updateProduct,
  getProductsBySubCategory,
  getProductsModel,
  getproductByname,
  getProductBycategory,
  getProductByBarcode,
  getProductWithStock,
  countEachProductOrder
};