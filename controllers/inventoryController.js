const { Products } = require("../models/productModel");
const { getOrganizationId } = require("../middleware/authmiddleware");
const mongoose = require("mongoose"); // Add this import

const getInventory = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req);
    if (!organizationId) {
      return res.status(401).json({ message: "Organization ID is missing" });
    }

    const page = Number.parseInt(req.query.page) || 1;
    const limit = Number.parseInt(req.query.limit) || 8;
    const search = req.query.search || "";
    const categoryId = req.query.categoryId || "";
    const subcategoryId = req.query.subcategoryId || "";
    const sortBy = req.query.sortBy || "name";
    const sortOrder = req.query.sortOrder || "asc";

    console.log('🔍 Query parameters received:', {
      page, limit, search, categoryId, subcategoryId, sortBy, sortOrder
    });

    // Build filter object with organizationId
    const filter = { organizationId };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { barcode: { $regex: search, $options: "i" } }
      ];
    }

    // Validate and add categoryId filter - FIXED LOGIC
    if (categoryId && categoryId !== "" && categoryId !== "[object Object]") {
      // Check if it's a valid ObjectId to prevent CastError
      if (mongoose.Types.ObjectId.isValid(categoryId)) {
        filter.categoryId = categoryId; // Use string directly if your schema expects strings
        console.log('✅ Added valid categoryId to filter:', categoryId);
      } else {
        console.warn(`❌ Invalid categoryId format: ${categoryId}`);
        // Don't add to filter if invalid to avoid CastError
      }
    } else if (categoryId === "[object Object]") {
      console.warn('❌ Blocked "[object Object]" categoryId from being added to filter');
    }

    // Validate and add subcategoryId filter - FIXED LOGIC
    if (subcategoryId && subcategoryId !== "" && subcategoryId !== "[object Object]") {
      if (mongoose.Types.ObjectId.isValid(subcategoryId)) {
        filter.subcategoryId = subcategoryId; // Use string directly if your schema expects strings
        console.log('✅ Added valid subcategoryId to filter:', subcategoryId);
      } else {
        console.warn(`❌ Invalid subcategoryId format: ${subcategoryId}`);
      }
    } else if (subcategoryId === "[object Object]") {
      console.warn('❌ Blocked "[object Object]" subcategoryId from being added to filter');
    }

    // Build sort object
    const sort = {};
    if (sortBy === "price") {
      sort.sellingPrice = sortOrder === "asc" ? 1 : -1;
    } else if (sortBy === "quantity") {
      sort.quantity = sortOrder === "asc" ? 1 : -1;
    } else {
      sort.name = sortOrder === "asc" ? 1 : -1;
    }

    const skip = (page - 1) * limit;

    console.log('📊 Final filter being used:', JSON.stringify(filter, null, 2));

    // Get total count for pagination
    const totalProducts = await Products.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    // Get inventory with pagination
    const inventory = await Products.find(filter)
      .populate("categoryId", "categoryName")
      .populate("subcategoryId", "subcategoryName")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    console.log(
      `✅ Inventory page ${page}, showing ${inventory.length} of ${totalProducts} products for org ${organizationId}`
    );

    res.status(200).json({
      inventory,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching inventory:", error);
    res.status(500).json({
      message: "Failed to fetch inventory",
      error: error.message,
    });
  }
};

module.exports = { getInventory };