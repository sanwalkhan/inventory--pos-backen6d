const { Products } = require("../models/productModel")
const { Subcategory } = require("../models/subcategoryModel")
const cloudinary = require("cloudinary").v2
const { Order } = require("../models/orderModel")
const { getOrganizationId } = require("../middleware/authmiddleware")
const Category = require("../models/categoryModel")

function calculateSellingPrices({ price, salesTax = 0, customDuty = 0, withholdingTax = 0, margin = 0, discount = 0 }) {
  price = Number.parseFloat(price)
  salesTax = Number.parseFloat(salesTax)
  customDuty = Number.parseFloat(customDuty)
  withholdingTax = Number.parseFloat(withholdingTax)
  margin = Number.parseFloat(margin)
  discount = Number.parseFloat(discount)

  const salesTaxAmount = (price * salesTax) / 100
  const customDutyAmount = (price * customDuty) / 100
  const withholdingTaxAmount = (price * withholdingTax) / 100
  const marginAmount = (price * margin) / 100

  const sellingPriceWithoutDiscount = price + salesTaxAmount + customDutyAmount + withholdingTaxAmount + marginAmount

  const discountAmount = (sellingPriceWithoutDiscount * discount) / 100
  const sellingPrice = sellingPriceWithoutDiscount - discountAmount

  return {
    sellingPriceWithoutDiscount: Number(sellingPriceWithoutDiscount.toFixed(2)),
    sellingPrice: Number(sellingPrice.toFixed(2)),
  }
}

const getProducts = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 10
    const search = req.query.search || ""
    const categoryId = req.query.categoryId || ""
    const subcategoryId = req.query.subcategoryId || ""
    const sortBy = req.query.sortBy || "name"
    const sortOrder = req.query.sortOrder || "asc"

    const filter = { organizationId }

    if (search) {
      filter.$or = [{ name: { $regex: search, $options: "i" } }, { barcode: { $regex: search, $options: "i" } }]
    }

    if (categoryId) {
      filter.categoryId = categoryId
    }

    if (subcategoryId) {
      filter.subcategoryId = subcategoryId
    }

    const sort = {}
    if (sortBy === "price") {
      sort.sellingPrice = sortOrder === "asc" ? 1 : -1
    } else if (sortBy === "quantity") {
      sort.quantity = sortOrder === "asc" ? 1 : -1
    } else {
      sort.name = sortOrder === "asc" ? 1 : -1
    }

    const skip = (page - 1) * limit

    const totalProducts = await Products.countDocuments(filter)
    const totalPages = Math.ceil(totalProducts / limit)

    const products = await Products.find(filter)
      .populate("categoryId", "categoryName")
      .populate("subcategoryId", "subcategoryName")
      .sort(sort)
      .skip(skip)
      .limit(limit)

    res.status(200).json({
      message: "Products retrieved successfully",
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit,
      },
    })
  } catch (error) {
    console.error("Error retrieving products:", error.message)
    res.status(500).json({ message: "Server error" })
  }
}

const addProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      quantity,
      barcode,
      categoryId,
      subcategoryId,
      description,
      marginPercent = 0,
      discount = 0,
      imageUrl = "",
    } = req.body;
    const organizationId = req.organizationId || getOrganizationId(req);

    // Required field validation
    if (!name || !price || !quantity || !barcode || !categoryId || !subcategoryId) {
      return res.status(400).json({
        message: "Name, price, quantity, barcode, category, and subcategory are required",
      });
    }

    // Validate category exists
    const category = await Category.findOne({
      _id: categoryId,
      organizationId,
    });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Validate subcategory exists and belongs to category
    const subcategory = await Subcategory.findOne({
      _id: subcategoryId,
      category: categoryId,
      organizationId,
    });
    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" });
    }

    // Check for duplicate barcode
    const existingBarcode = await Products.findOne({
      barcode,
      organizationId,
    });
    if (existingBarcode) {
      return res.status(400).json({ message: "Barcode already exists" });
    }

    // Parse numeric values
    const priceNum = parseFloat(price);
    const quantityNum = parseInt(quantity);
    const marginPercentNum = parseFloat(marginPercent) || 0;
    const discountNum = parseFloat(discount) || 0;

    // Validate numeric values
    if (isNaN(priceNum) || priceNum <= 0) {
      return res.status(400).json({ message: "Valid price is required" });
    }
    if (isNaN(quantityNum) || quantityNum < 0) {
      return res.status(400).json({ message: "Valid quantity is required" });
    }
    if (isNaN(marginPercentNum) || marginPercentNum < 0 || marginPercentNum > 100) {
      return res.status(400).json({ message: "Margin must be between 0-100%" });
    }
    if (isNaN(discountNum) || discountNum < 0 || discountNum > 100) {
      return res.status(400).json({ message: "Discount must be between 0-100%" });
    }

    // Calculate selling prices
    const sellingPriceWithoutDiscount = priceNum * (1 + marginPercentNum / 100);
    const sellingPrice = sellingPriceWithoutDiscount * (1 - discountNum / 100);

    // Handle image - make it optional
    let image = "";
    let imagePublicId = "";
    let imageSource = "file";

    if (req.file) {
      image = req.file.path;
      imagePublicId = req.file.filename;
      imageSource = "file";
    } else if (imageUrl && imageUrl.trim()) {
      image = imageUrl.trim();
      imageSource = "url";
    }
    // If no image provided, empty strings will be used

    // Create product
    const product = new Products({
      organizationId,
      name: name.trim(),
      price: priceNum,
      quantity: quantityNum,
      barcode: barcode.trim(),
      categoryId,
      subcategoryId,
      description: description?.trim() || "",
      marginPercent: marginPercentNum,
      discount: discountNum,
      sellingPrice,
      sellingPriceWithoutDiscount,
      salesTax: subcategory.salesTax || 0,
      customDuty: subcategory.customDuty || 0,
      withholdingTax: subcategory.withholdingTax || 0,
      hsCode: subcategory.hsCode,
      image,
      imagePublicId,
      imageSource,
    });

    await product.save();

    // Populate the response
    await product.populate("categoryId");
    await product.populate("subcategoryId");

    res.status(201).json({
      message: "Product created successfully",
      product,
    });
  } catch (error) {
    console.error("Error adding product:", error.message);

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Duplicate entry. Please use unique values.",
      });
    }

    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE PRODUCT
const updateProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      quantity,
      barcode,
      categoryId,
      subcategoryId,
      description,
      marginPercent,
      discount,
      imageUrl = "",
    } = req.body;
    const { id } = req.params;
    const organizationId = req.organizationId || getOrganizationId(req);

    const product = await Products.findOne({
      _id: id,
      organizationId,
    }).populate("categoryId subcategoryId");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Validate category if provided
    if (categoryId) {
      const category = await Category.findOne({
        _id: categoryId,
        organizationId,
      });
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }
    }

    // Validate subcategory if provided
    if (subcategoryId) {
      const subcategory = await Subcategory.findOne({
        _id: subcategoryId,
        category: categoryId || product.categoryId._id,
        organizationId,
      });
      if (!subcategory) {
        return res.status(404).json({ message: "Subcategory not found" });
      }
    }

    // Check for duplicate barcode
    if (barcode && barcode !== product.barcode) {
      const existingBarcode = await Products.findOne({
        barcode,
        organizationId,
        _id: { $ne: id },
      });
      if (existingBarcode) {
        return res.status(400).json({ message: "Barcode already exists" });
      }
    }

    // Parse numeric values
    const priceNum = price !== undefined ? parseFloat(price) : product.price;
    const quantityNum = quantity !== undefined ? parseInt(quantity) : product.quantity;
    const marginPercentNum = marginPercent !== undefined ? parseFloat(marginPercent) : product.marginPercent;
    const discountNum = discount !== undefined ? parseFloat(discount) : product.discount;

    // Validate numeric values
    if (price !== undefined && (isNaN(priceNum) || priceNum <= 0)) {
      return res.status(400).json({ message: "Valid price is required" });
    }
    if (quantity !== undefined && (isNaN(quantityNum) || quantityNum < 0)) {
      return res.status(400).json({ message: "Valid quantity is required" });
    }
    if (marginPercent !== undefined && (isNaN(marginPercentNum) || marginPercentNum < 0 || marginPercentNum > 100)) {
      return res.status(400).json({ message: "Margin must be between 0-100%" });
    }
    if (discount !== undefined && (isNaN(discountNum) || discountNum < 0 || discountNum > 100)) {
      return res.status(400).json({ message: "Discount must be between 0-100%" });
    }

    // Calculate selling prices
    const sellingPriceWithoutDiscount = priceNum * (1 + marginPercentNum / 100);
    const sellingPrice = sellingPriceWithoutDiscount * (1 - discountNum / 100);

    // Get subcategory for tax info
    const subcategory = await Subcategory.findOne({
      _id: subcategoryId || product.subcategoryId._id,
      organizationId,
    });

    const updateData = {
      ...(name && { name: name.trim() }),
      ...(price !== undefined && { price: priceNum }),
      ...(quantity !== undefined && { quantity: quantityNum }),
      ...(barcode && { barcode: barcode.trim() }),
      ...(categoryId && { categoryId }),
      ...(subcategoryId && { subcategoryId }),
      ...(description !== undefined && { description: description.trim() }),
      ...(marginPercent !== undefined && { marginPercent: marginPercentNum }),
      ...(discount !== undefined && { discount: discountNum }),
      sellingPrice,
      sellingPriceWithoutDiscount,
      salesTax: subcategory?.salesTax || product.salesTax,
      customDuty: subcategory?.customDuty || product.customDuty,
      withholdingTax: subcategory?.withholdingTax || product.withholdingTax,
      hsCode: subcategory?.hsCode || product.hsCode,
    };

    // Handle image updates - optional
    if (req.file) {
      // Delete old image if exists
      if (product.imagePublicId && product.imageSource === "file") {
        await cloudinary.uploader.destroy(product.imagePublicId);
      }
      updateData.image = req.file.path;
      updateData.imagePublicId = req.file.filename;
      updateData.imageSource = "file";
    } else if (imageUrl && imageUrl.trim()) {
      // Delete old image if exists
      if (product.imagePublicId && product.imageSource === "file") {
        await cloudinary.uploader.destroy(product.imagePublicId);
      }
      updateData.image = imageUrl.trim();
      updateData.imagePublicId = "";
      updateData.imageSource = "url";
    } else if (imageUrl === "") {
      // Clear image if empty string provided
      if (product.imagePublicId && product.imageSource === "file") {
        await cloudinary.uploader.destroy(product.imagePublicId);
      }
      updateData.image = "";
      updateData.imagePublicId = "";
      updateData.imageSource = "file";
    }
    // If no image provided in update, keep existing image

    const updatedProduct = await Products.findByIdAndUpdate(id, updateData, {
      new: true,
    }).populate("categoryId subcategoryId");

    res.status(200).json({
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Error updating product:", error.message);

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Duplicate entry. Please use unique values.",
      });
    }

    res.status(500).json({ message: "Server error" });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const product = await Products.findOne({ _id: req.params.id, organizationId })
    if (!product) {
      return res.status(404).json({ message: "Product not found" })
    }

    if (product.imagePublicId && product.imageSource === "file") {
      await cloudinary.uploader.destroy(product.imagePublicId)
    }

    await Products.findByIdAndDelete(req.params.id)
    res.status(200).json({ message: "Product deleted successfully", product })
  } catch (error) {
    console.error("Error deleting product:", error.message)
    res.status(500).json({ message: "Server error" })
  }
}

const getProductsBySubCategory = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 8
    const subcategoryId = req.query.subcategory

    const filter = { organizationId }
    if (subcategoryId) {
      filter.subcategoryId = subcategoryId
    }

    const skip = (page - 1) * limit
    const totalProducts = await Products.countDocuments(filter)
    const totalPages = Math.ceil(totalProducts / limit)

    const products = await Products.find(filter)
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName")
      .skip(skip)
      .limit(limit)

    res.status(200).json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit,
      },
    })
  } catch (err) {
    console.error("Error fetching products:", err)
    res.status(500).json({ error: "Server error" })
  }
}

const getProductsModel = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 8
    const subcategoryId = req.params.subcategoryId

    const filter = { organizationId }
    if (subcategoryId) {
      filter.subcategoryId = subcategoryId
    }

    const skip = (page - 1) * limit
    const totalProducts = await Products.countDocuments(filter)
    const totalPages = Math.ceil(totalProducts / limit)

    const products = await Products.find(filter)
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName")
      .skip(skip)
      .limit(limit)

    res.status(200).json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit,
      },
    })
  } catch (err) {
    console.error("Error fetching products:", err)
    res.status(500).json({ error: "Server error" })
  }
}

const getproductByname = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const { name, hsCode } = req.query
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 8

    const filter = { organizationId }

    if (name) {
      filter.name = { $regex: name, $options: "i" }
    }

    if (hsCode) {
      filter.hsCode = { $regex: hsCode, $options: "i" }
    }

    if (!name && !hsCode) {
      return res.status(400).json({ message: "Product name or HS code is required" })
    }

    const skip = (page - 1) * limit
    const totalProducts = await Products.countDocuments(filter)
    const totalPages = Math.ceil(totalProducts / limit)

    const products = await Products.find(filter)
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName")
      .skip(skip)
      .limit(limit)

    res.status(200).json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit,
      },
    })
  } catch (err) {
    console.error("Error fetching products:", err)
    res.status(500).json({ message: "Server error" })
  }
}

const getProductBycategory = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const { categoryId } = req.query
    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 8

    if (!categoryId) {
      return res.status(400).json({ message: "Category id is required" })
    }

    const filter = { categoryId: categoryId, organizationId }

    const skip = (page - 1) * limit
    const totalProducts = await Products.countDocuments(filter)
    const totalPages = Math.ceil(totalProducts / limit)

    const products = await Products.find(filter)
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName")
      .skip(skip)
      .limit(limit)

    res.status(200).json({
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit,
      },
    })
  } catch (err) {
    console.error("Error fetching products:", err)
    res.status(500).json({ message: "Server error" })
  }
}

const getProductByBarcode = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const { barcode } = req.query
    if (!barcode) {
      return res.status(400).json({ message: "Barcode is required" })
    }

    const normalizedBarcode = barcode.trim().toLowerCase()
    const product = await Products.find({
      organizationId,
      barcode: { $regex: `^${normalizedBarcode}$`, $options: "i" },
    })
      .populate("subcategoryId", "subcategoryName")
      .populate("categoryId", "categoryName")

    if (!product || product.length === 0) {
      return res.status(404).json({ message: "Product not found" })
    }

    res.status(200).json({ product })
  } catch (error) {
    console.error("Error fetching product by barcode:", error.message)
    res.status(500).json({ message: "Failed to fetch product" })
  }
}

const getProductWithStock = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const products = await Products.find({ organizationId, quantity: { $gt: 0 } })
    if (!products || products.length === 0) {
      return res.status(404).json({ message: "No products found" })
    }
    res.status(200).json({ products })
  } catch (error) {
    console.error("Error fetching products:", error.message)
    res.status(500).json({ message: "Server error" })
  }
}

const countEachProductOrder = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const allProducts = await Products.find({ organizationId }).lean()
    const allOrders = await Order.find({ organizationId }).lean()

    const productOrderCountMap = {}

    allOrders.forEach((order) => {
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item) => {
          const productId = item.productId?.toString()
          const quantity = item.quantity || 0
          if (!productId) return

          if (!productOrderCountMap[productId]) {
            productOrderCountMap[productId] = 0
          }
          productOrderCountMap[productId] += quantity
        })
      }
    })

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
      hsCode: product.hsCode,
      image: product.image,
      salesTax: product.salesTax,
      customDuty: product.customDuty,
      withholdingTax: product.withholdingTax,
      exemptions: product.exemptions,
      unitOfMeasurement: product.unitOfMeasurement,
      marginPercent: product.marginPercent,
      discount: product.discount,
      sellingPriceWithoutDiscount: product.sellingPriceWithoutDiscount,
      sellingPrice: product.sellingPrice,
    }))

    res.json(productsWithSellingCount)
  } catch (error) {
    console.error("Error counting each product orders:", error)
    res.status(500).json({ message: "Failed to get product selling counts" })
  }
}

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
  countEachProductOrder,
}
