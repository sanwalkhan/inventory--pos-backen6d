const { Products } = require("../models/productModel");
const cloudinary = require("cloudinary").v2;
const {Order}= require('../models/orderModel')

// Helper: Calculate selling price
function calculateSellingPrice({
  price,
  saleTax = 0,
  withholdingTax = 0,
  gst = 0,
  margin = 12,
}) {
  // Convert inputs to floats
  price = parseFloat(price);
  saleTax = parseFloat(saleTax);
  withholdingTax = parseFloat(withholdingTax);
  gst = parseFloat(gst);
  margin = parseFloat(margin);

  const saleTaxAmount = (price * saleTax) / 100;
  const withholdingTaxAmount = (price * withholdingTax) / 100;
  const gstAmount = (price * gst) / 100;
  const marginAmount = (price * margin) / 100;

  const sellingPrice = price + saleTaxAmount + gstAmount + withholdingTaxAmount + marginAmount;

  return Number(sellingPrice.toFixed(2));
}

// Get all products
const getProducts = async (req, res) => {
  try {
    const products = await Products.find()
      .populate("categoryId", "categoryName")
      .populate("subcategoryId", "subcategoryName");

    res.status(200).json({ message: "Products retrieved successfully", products });
  } catch (error) {
    console.error("Error retrieving products:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Add product with actual price calculation
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

    // Calculate selling price
    const sellingPrice = calculateSellingPrice({
      price,
      saleTax,
      withholdingTax,
      gst,
      margin: 12, // fixed margin %
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
      marginPercent: 12,
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

// Update product with actual price calculation
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

    // Calculate selling price
    const sellingPrice = calculateSellingPrice({
      price,
      saleTax,
      withholdingTax,
      gst,
      margin: 12,
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
      marginPercent: 12,
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

// Get by subcategory (query param)
const getProductsBySubCategory = async (req, res) => {
  try {
    const filter = {};
    if (req.query.subcategory) {
      filter.subcategoryId = req.query.subcategory;
    }

    const products = await Products.find(filter)
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName");

    res.status(200).json({ products });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Server error" });
  }
};

// Get by subcategory (URL param)
const getProductsModel = async (req, res) => {
  try {
    const filter = {};
    if (req.params.subcategoryId) {
      filter.subcategoryId = req.params.subcategoryId;
    }

    const products = await Products.find(filter)
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName");

    res.status(200).json({ products });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ error: "Server error" });
  }
};
const getproductByname = async (req, res) => {
  try {
    const { name } = req.query; // ✅ get query param
    if (!name) {
      return res.status(400).json({ message: "Product name is required" });
    }

    // ✅ case-insensitive partial search
    const products = await Products.find({
      name: { $regex: name, $options: "i" }
    })
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName");

    res.status(200).json({ products });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ message: "Server error" });
  }
};
const getProductBycategory = async (req, res) => {
  try {
    const { categoryId } = req.query; // ✅ get query param
    if (!categoryId) {
      return res.status(400).json({ message: "Category id is required" });
    }

    // ✅ case-insensitive partial search
    const products = await Products.find({
      categoryId: categoryId
    })
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName");

    res.status(200).json({ products });
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ message: "Server error" });
  }
};
// Backend - change route and parameter access
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
    const products = await Products.find({ quantity: { $gt: 0 } })
    if (!products) {
      return res.status(404).json({ message: "No products found" });
    }
    res.status(200).json({ products });
  }
  catch (error) {
    console.error("Error fetching products:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Change route to not expect URL parameter

const countEachProductOrder = async (req, res) => {
  try {
    const allProducts = await Products.find().lean();
    const allOrders = await Order.find().lean();

    // Prepare a map to count sold quantities per productId
    const productOrderCountMap = {};

    // Iterate through all orders' items to count quantities sold per product
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

    // Map products to include their sold quantity
    const productsWithSellingCount = allProducts.map((product) => ({
      _id: product._id,
      name: product.name,
      price: product.price,
      quantity: product.quantity, // available stock
      sellingCount: productOrderCountMap[product._id.toString()] || 0,
      barcode: product.barcode,
      description: product.description,
      categoryId: product.categoryId,
      subcategoryId: product.subcategoryId,
      image: product.image,
      // Include other product fields as needed
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
