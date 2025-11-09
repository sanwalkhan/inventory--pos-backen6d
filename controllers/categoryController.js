const Category = require("../models/categoryModel")
const { Subcategory } = require("../models/subcategoryModel")
const {Products}= require("../models/productModel")
const cloudinary = require("cloudinary").v2
const { getOrganizationId } = require("../middleware/authmiddleware")

// ADD CATEGORY
const categoryController = async (req, res) => {
  try {
    const { categoryName, hsCode, imageUrl } = req.body
    const organizationId = req.organizationId || getOrganizationId(req)

    if (!categoryName || !hsCode) {
      return res.status(400).json({
        message: "Category name and HS code are required",
      })
    }

    // REMOVED: Image requirement validation
    // if (!req.file && !imageUrl) {
    //   return res.status(400).json({
    //     message: "Either image file or image URL is required",
    //   })
    // }

    if (categoryName.length > 100) {
      return res.status(400).json({
        message: "Category name must not exceed 100 characters",
      })
    }

    const existingCategoryName = await Category.findOne({
      organizationId,
      categoryName: { $regex: new RegExp(`^${categoryName.trim()}$`, "i") },
    })
    if (existingCategoryName) {
      return res.status(400).json({
        message: "Category name already exists in your organization",
      })
    }

    if (!/^\d{4}$/.test(hsCode)) {
      return res.status(400).json({
        message: "HS code must be exactly 4 digits",
      })
    }

    const existingHS = await Category.findOne({
      organizationId,
      hsCode,
    })
    if (existingHS) {
      return res.status(400).json({
        message: "HS code already exists in your organization",
      })
    }

    let image = null
    let imagePublicId = null
    let imageSource = "file"

    // Make image optional - only set if provided
    if (req.file) {
      image = req.file.path
      imagePublicId = req.file.filename
      imageSource = "file"
    } else if (imageUrl && imageUrl.trim()) {
      try {
        new URL(imageUrl)
        image = imageUrl
        imageSource = "url"
      } catch (error) {
        // If invalid URL, just don't set the image (make it optional)
        image = null
        imageSource = "file"
      }
    }

    const newCategory = new Category({
      organizationId,
      categoryName: categoryName.trim(),
      hsCode,
      image,
      imagePublicId,
      imageSource,
    })

    await newCategory.save()

    res.status(201).json({
      message: "Category added successfully",
      category: newCategory,
    })
  } catch (error) {
    console.error("Add category error:", error)

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Duplicate entry. Please use unique values.",
      })
    }

    res.status(500).json({
      message: "Server error while adding category",
      error: error.message,
    })
  }
}

// GET ALL CATEGORIES FOR CURRENT ORGANIZATION
const getAllCategories = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)

    const categories = await Category.find({ organizationId }).sort({
      createdAt: -1,
    })

    res.status(200).json({
      message: "Categories retrieved successfully",
      categories,
      count: categories.length,
    })
  } catch (error) {
    console.error("Error retrieving categories:", error.message)
    res.status(500).json({
      message: "Server error while retrieving categories",
      error: error.message,
    })
  }
}

// GET PAGINATED CATEGORIES
const getPaginatedCategories = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req);
    
    // Get query parameters with default values
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || "";
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    // Validate pagination parameters
    if (page < 1) {
      return res.status(400).json({
        message: "Page must be greater than 0"
      });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        message: "Limit must be between 1 and 100"
      });
    }

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Build search query
    let searchQuery = { organizationId };
    
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search, "i");
      searchQuery.$or = [
        { categoryName: searchRegex },
        { hsCode: searchRegex }
      ];
    }

    // Build sort object
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder;

    // Execute queries in parallel for better performance
    const [categories, totalCount] = await Promise.all([
      // Get paginated categories
      Category.find(searchQuery)
        .sort(sortOptions)
        .skip(skip)
        .limit(limit),
      
      // Get total count for pagination
      Category.countDocuments(searchQuery)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Get subcategory counts for each category
    const categoriesWithSubcategoryCounts = await Promise.all(
      categories.map(async (category) => {
        const subcategoryCount = await Subcategory.countDocuments({
          category: category._id,
          organizationId,
        });
        
        return {
          ...category.toObject(),
          subcategoryCount,
        };
      })
    );

    res.status(200).json({
      message: "Paginated categories retrieved successfully",
      data: {
        categories: categoriesWithSubcategoryCounts,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit,
        },
        search: {
          query: search,
          hasSearch: search && search.trim() !== "",
        },
        sort: {
          by: sortBy,
          order: sortOrder === 1 ? "asc" : "desc",
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving paginated categories:", error.message);
    res.status(500).json({
      message: "Server error while retrieving paginated categories",
      error: error.message,
    });
  }
}

// GET CATEGORY BY ID
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params
    const organizationId = req.organizationId || getOrganizationId(req)

    const category = await Category.findOne({
      _id: id,
      organizationId,
    })

    if (!category) {
      return res.status(404).json({
        message: "Category not found in your organization",
      })
    }

    res.status(200).json({
      message: "Category retrieved successfully",
      category,
    })
  } catch (error) {
    console.error("Error retrieving category:", error.message)
    res.status(500).json({
      message: "Server error while retrieving category",
      error: error.message,
    })
  }
}

// UPDATE CATEGORY
const updateCategory = async (req, res) => {
  try {
    const { categoryName, hsCode, imageUrl } = req.body
    const { id } = req.params
    const organizationId = req.organizationId || getOrganizationId(req)

    if (!categoryName || !hsCode) {
      return res.status(400).json({
        message: "Category name and HS code are required",
      })
    }

    if (categoryName.length > 100) {
      return res.status(400).json({
        message: "Category name must not exceed 100 characters",
      })
    }

    const category = await Category.findOne({
      _id: id,
      organizationId,
    })
    if (!category) {
      return res.status(404).json({
        message: "Category not found in your organization",
      })
    }

    const duplicateName = await Category.findOne({
      organizationId,
      categoryName: { $regex: new RegExp(`^${categoryName.trim()}$`, "i") },
      _id: { $ne: id },
    })
    if (duplicateName) {
      return res.status(400).json({
        message: "Category name already exists in your organization",
      })
    }

    if (!/^\d{4}$/.test(hsCode)) {
      return res.status(400).json({
        message: "HS code must be exactly 4 digits",
      })
    }

    const duplicateHS = await Category.findOne({
      organizationId,
      hsCode,
      _id: { $ne: id },
    })
    if (duplicateHS) {
      return res.status(400).json({
        message: "HS code already exists in your organization",
      })
    }

    const updateData = {
      categoryName: categoryName.trim(),
      hsCode,
    }

    // Handle image updates - optional
    if (req.file) {
      // Delete old image if exists
      if (category.imagePublicId && category.imageSource === "file") {
        await cloudinary.uploader.destroy(category.imagePublicId)
      }
      updateData.image = req.file.path
      updateData.imagePublicId = req.file.filename
      updateData.imageSource = "file"
    } else if (imageUrl && imageUrl.trim()) {
      try {
        new URL(imageUrl)
        // Delete old image if exists
        if (category.imagePublicId && category.imageSource === "file") {
          await cloudinary.uploader.destroy(category.imagePublicId)
        }
        updateData.image = imageUrl
        updateData.imagePublicId = null
        updateData.imageSource = "url"
      } catch (error) {
        // If invalid URL, keep existing image or set to null
        if (!category.image) {
          updateData.image = null
          updateData.imagePublicId = null
          updateData.imageSource = "file"
        }
      }
    } else {
      // If no image provided in update, keep the existing image
      // Or if you want to remove image on update, uncomment below:
      // updateData.image = null
      // updateData.imagePublicId = null
      // updateData.imageSource = "file"
    }

    if (category.hsCode !== hsCode) {
      const subcategories = await Subcategory.find({
        category: id,
        organizationId,
      })

      for (const subcategory of subcategories) {
        const subPart = subcategory.hsCode.split(".")[1]
        const newFullCode = `${hsCode}.${subPart}`
        await Subcategory.findByIdAndUpdate(subcategory._id, {
          hsCode: newFullCode,
        })
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(id, updateData, {
      new: true,
    })

    res.status(200).json({
      message: "Category updated successfully",
      category: updatedCategory,
    })
  } catch (error) {
    console.error("Error updating category:", error.message)

    if (error.code === 11000) {
      return res.status(400).json({
        message: "Duplicate entry. Please use unique values.",
      })
    }

    res.status(500).json({
      message: "Server error while updating category",
      error: error.message,
    })
  }
}

// DELETE CATEGORY
const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id
    const organizationId = req.organizationId || getOrganizationId(req)

    const category = await Category.findOne({
      _id: categoryId,
      organizationId,
    })
    if (!category) {
      return res.status(404).json({
        message: "Category not found in your organization",
      })
    }

    const subcategoryCount = await Subcategory.countDocuments({
      category: categoryId,
      organizationId,
    })
    if (subcategoryCount > 0) {
      return res.status(400).json({
        message: "Cannot delete category with existing subcategories",
        subcategoryCount,
      })
    }

    if (category.imagePublicId && category.imageSource === "file") {
      await cloudinary.uploader.destroy(category.imagePublicId)
    }

    await Category.findByIdAndDelete(categoryId)

    res.status(200).json({
      message: "Category deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting category:", error.message)
    res.status(500).json({
      message: "Server error while deleting category",
      error: error.message,
    })
  }
}

// GET SUBCATEGORIES BY CATEGORY
const getSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params
    const organizationId = req.organizationId || getOrganizationId(req)

    const category = await Category.findOne({
      _id: categoryId,
      organizationId,
    })
    if (!category) {
      return res.status(404).json({
        message: "Category not found in your organization",
      })
    }

    const subcategories = await Subcategory.find({
      category: categoryId,
      organizationId,
    }).populate("category")

    res.status(200).json({
      success: true,
      subcategories,
      count: subcategories.length,
    })
  } catch (error) {
    console.error("Error fetching subcategories:", error.message)
    res.status(500).json({
      success: false,
      message: "Server error while retrieving subcategories",
      error: error.message,
    })
  }
}

// GET PAGINATED SUBCATEGORIES BY CATEGORY
const getPaginatedSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const organizationId = req.organizationId || getOrganizationId(req);
    
    // Get query parameters with default values
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 12;
    const search = req.query.search || "";
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    // Validate pagination parameters
    if (page < 1) {
      return res.status(400).json({
        message: "Page must be greater than 0"
      });
    }

    if (limit < 1 || limit > 100) {
      return res.status(400).json({
        message: "Limit must be between 1 and 100"
      });
    }

    // Verify category exists
    const category = await Category.findOne({
      _id: categoryId,
      organizationId,
    });
    if (!category) {
      return res.status(404).json({
        message: "Category not found in your organization",
      });
    }

    // Calculate skip value
    const skip = (page - 1) * limit;

    // Build search query
    let searchQuery = { 
      category: categoryId,
      organizationId 
    };
    
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search, "i");
      searchQuery.$or = [
        { subcategoryName: searchRegex },
        { hsCode: searchRegex }
      ];
    }

    // Build sort object
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder;

    // Execute queries in parallel for better performance
    const [subcategories, totalCount] = await Promise.all([
      // Get paginated subcategories
      Subcategory.find(searchQuery)
        .populate("category")
        .sort(sortOptions)
        .skip(skip)
        .limit(limit),
      
      // Get total count for pagination
      Subcategory.countDocuments(searchQuery)
    ]);

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Get product counts for each subcategory
    const subcategoriesWithProductCounts = await Promise.all(
      subcategories.map(async (subcategory) => {
        // Try different field names that might be used in your Products model
        const productCount1 = await Products.countDocuments({
          subcategoryId: subcategory._id,
          organizationId,
        });

        const productCount2 = await Products.countDocuments({
          subcategory: subcategory._id,
          organizationId,
        });

        const productCount3 = await Products.countDocuments({
          subcategoryId: subcategory._id.toString(),
          organizationId,
        });

        const productCount = productCount1 || productCount2 || productCount3;
        
        return {
          ...subcategory.toObject(),
          productCount,
        };
      })
    );

    res.status(200).json({
      message: "Paginated subcategories retrieved successfully",
      data: {
        subcategories: subcategoriesWithProductCounts,
        category: {
          _id: category._id,
          categoryName: category.categoryName,
          hsCode: category.hsCode,
        },
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasNextPage,
          hasPrevPage,
          limit,
        },
        search: {
          query: search,
          hasSearch: search && search.trim() !== "",
        },
        sort: {
          by: sortBy,
          order: sortOrder === 1 ? "asc" : "desc",
        },
      },
    });
  } catch (error) {
    console.error("Error retrieving paginated subcategories:", error.message);
    res.status(500).json({
      message: "Server error while retrieving paginated subcategories",
      error: error.message,
    });
  }
}

// SEARCH CATEGORIES
const searchCategories = async (req, res) => {
  try {
    const { query } = req.query
    const organizationId = req.organizationId || getOrganizationId(req)

    if (!query || query.trim() === "") {
      return res.status(400).json({
        message: "Search query is required",
      })
    }

    const searchRegex = new RegExp(query, "i")

    const categories = await Category.find({
      organizationId,
      $or: [{ categoryName: searchRegex }, { hsCode: searchRegex }],
    }).sort({ createdAt: -1 })

    res.status(200).json({
      message: "Categories search completed successfully",
      categories,
      count: categories.length,
    })
  } catch (error) {
    console.error("Error searching categories:", error.message)
    res.status(500).json({
      message: "Server error while searching categories",
      error: error.message,
    })
  }
}

// GET CATEGORIES WITH SUBCATEGORIES (subcategory count > 0)
const getCategoriesWithSubcategories = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)

    // Get all categories for the organization
    const categories = await Category.find({ organizationId }).sort({
      createdAt: -1,
    })

    // Filter categories that have at least one subcategory
    const categoriesWithSubcategories = []
    
    for (const category of categories) {
      const subcategoryCount = await Subcategory.countDocuments({
        category: category._id,
        organizationId,
      })
      
      if (subcategoryCount > 0) {
        categoriesWithSubcategories.push({
          ...category.toObject(),
          subcategoryCount,
        })
      }
    }

    res.status(200).json({
      message: "Categories with subcategories retrieved successfully",
      categories: categoriesWithSubcategories,
      count: categoriesWithSubcategories.length,
    })
  } catch (error) {
    console.error("Error retrieving categories with subcategories:", error.message)
    res.status(500).json({
      message: "Server error while retrieving categories with subcategories",
      error: error.message,
    })
  }
}

// GET SUBCATEGORIES WITH PRODUCTS (product count > 0)
const getSubcategoriesWithProducts = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    const { categoryId } = req.params

    console.log("🔍 Searching for subcategories with products:", {
      categoryId,
      organizationId
    });

    // Verify category exists
    const category = await Category.findOne({
      _id: categoryId,
      organizationId,
    })
    if (!category) {
      return res.status(404).json({
        message: "Category not found in your organization",
      })
    }

    // Get all subcategories for the specific category
    const subcategories = await Subcategory.find({
      category: categoryId,
      organizationId,
    })
      .populate("category")
      .sort({ createdAt: -1 })

    console.log(`📋 Found ${subcategories.length} subcategories for category ${categoryId}`);

    const subcategoriesWithProducts = []
    
    for (const subcategory of subcategories) {
      // Try different field names that might be used in your Products model
      const productCount1 = await Products.countDocuments({
        subcategoryId: subcategory._id,
        organizationId,
      })

      const productCount2 = await Products.countDocuments({
        subcategory: subcategory._id,
        organizationId,
      })

      const productCount3 = await Products.countDocuments({
        subcategoryId: subcategory._id.toString(),
        organizationId,
      })

      console.log(`🔍 Subcategory ${subcategory._id} (${subcategory.subcategoryName}):`, {
        productCount1,
        productCount2,
        productCount3
      });

      const productCount = productCount1 || productCount2 || productCount3;
      
      if (productCount > 0) {
        subcategoriesWithProducts.push({
          ...subcategory.toObject(),
          productCount,
        })
      }
    }

    console.log(`✅ Found ${subcategoriesWithProducts.length} subcategories with products`);

    res.status(200).json({
      message: "Subcategories with products retrieved successfully",
      subcategories: subcategoriesWithProducts,
      count: subcategoriesWithProducts.length,
    })
  } catch (error) {
    console.error("Error retrieving subcategories with products:", error.message)
    res.status(500).json({
      message: "Server error while retrieving subcategories with products",
      error: error.message,
    })
  }
}

module.exports = {
  categoryController,
  getAllCategories,
  getPaginatedCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getSubcategoriesByCategory,
  getPaginatedSubcategoriesByCategory,
  searchCategories,
  getCategoriesWithSubcategories,
  getSubcategoriesWithProducts,
}