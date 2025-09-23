const { Products } = require("../models/productModel");

const getInventory = async (req, res) => {
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

    // Get inventory with pagination
    const inventory = await Products.find(filter)
      .populate("categoryId", "categoryName")
      .populate("subcategoryId", "subcategoryName")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    console.log(`Inventory page ${page}, showing ${inventory.length} of ${totalProducts} products`);
    
    res.status(200).json({
      inventory,
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
    console.error("Error fetching inventory:", error);
    res.status(500).json({ message: "Failed to fetch inventory" });
  }
};

module.exports = { getInventory };