const { Products } = require("../models/productModel");
const cloudinary = require("cloudinary").v2;

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

// Add product with image upload
const addProduct = async (req, res) => {
  try {
    const { name, quantity, price, categoryId, subcategoryId } = req.body;

    if (!name || !quantity || !price || !categoryId || !subcategoryId) {
      return res.status(400).json({ message: "All fields are required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Product image is required" });
    }

    const image = req.file.path;            // Cloudinary URL
    const imagePublicId = req.file.filename; // Cloudinary public_id

    const product = new Products({
      name,
      quantity,
      price,
      categoryId,
      subcategoryId,
      image,
      imagePublicId,
    });

    await product.save();

    res.status(201).json({ message: "Product created successfully", product });
  } catch (error) {
    console.error("Error creating product:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// Delete product and remove image from Cloudinary
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

// Update product (including optional image change)
const updateProduct = async (req, res) => {
  try {
    const { name, quantity, price, categoryId, subcategoryId } = req.body;
    const { id } = req.params;

    const product = await Products.findById(id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const updateData = { name, quantity, price, categoryId, subcategoryId };

    if (req.file) {
      // Delete old image from Cloudinary
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
const getProductsBySubCategory = async (req, res) => {
  try {
    const filter = {};

    // Filter by subcategoryId if subcategory query param exists
    if (req.query.subcategory) {
      filter.subcategoryId = req.query.subcategory; // ✅ Correct field
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
const getProductsModel = async (req, res) => {
  try {
    const filter = {};

    // Use URL param instead of query param
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


module.exports = {
  getProducts,
  addProduct,
  deleteProduct,
  updateProduct,
  getProductsBySubCategory,
  getProductsModel,
};
