const { Category } = require("../models/categoryModel");
const { Subcategory } = require("../models/subcategoryModel");
const cloudinary = require("cloudinary").v2;

// ADD CATEGORY
const categoryController = async (req, res) => {
  try {
    const { categoryName, hsCode } = req.body;

    // Required fields
    if (!categoryName || !hsCode || !req.file) {
      return res.status(400).json({
        message: "Category name, HS code, and image are required",
      });
    }

    // Validate name length
    if (categoryName.length > 100) {
      return res.status(400).json({
        message: "Category name must not exceed 100 characters",
      });
    }

    // Check for duplicate name (case-insensitive)
    const existingCategoryName = await Category.findOne({
      categoryName: { $regex: new RegExp(`^${categoryName}$`, "i") },
    });
    if (existingCategoryName) {
      return res.status(400).json({
        message: "Category name already exists",
      });
    }

    // Validate HS code format (4 digits)
    if (!/^\d{4}$/.test(hsCode)) {
      return res.status(400).json({
        message: "HS code must be exactly 4 digits",
      });
    }

    // Check for duplicate HS code
    const existingHS = await Category.findOne({ hsCode });
    if (existingHS) {
      return res.status(400).json({
        message: "HS code already exists",
      });
    }

    const image = req.file.path;
    const imagePublicId = req.file.filename;

    const newCategory = new Category({
      categoryName: categoryName.trim(),
      hsCode,
      image,
      imagePublicId,
    });

    await newCategory.save();

    res.status(201).json({
      message: "Category added successfully",
      category: newCategory,
    });
  } catch (error) {
    console.error("Add category error:", error);

    if (error.code === 11000) {
      if (error.keyPattern?.categoryName) {
        return res
          .status(400)
          .json({ message: "Category name already exists" });
      }
      if (error.keyPattern?.hsCode) {
        return res.status(400).json({ message: "HS code already exists" });
      }
    }

    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL CATEGORIES
const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json({
      message: "Categories retrieved successfully",
      categories,
    });
  } catch (error) {
    console.error("Error retrieving categories:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE CATEGORY
const updateCategory = async (req, res) => {
  try {
    const { categoryName, hsCode } = req.body;
    const { id } = req.params;

    if (!categoryName || !hsCode) {
      return res.status(400).json({
        message: "Category name and HS code are required",
      });
    }

    // Validate name length
    if (categoryName.length > 100) {
      return res.status(400).json({
        message: "Category name must not exceed 100 characters",
      });
    }

    // Case-insensitive duplicate name check (excluding current)
    const duplicateName = await Category.findOne({
      categoryName: { $regex: new RegExp(`^${categoryName}$`, "i") },
      _id: { $ne: id },
    });
    if (duplicateName) {
      return res.status(400).json({
        message: "Category name already exists",
      });
    }

    // Validate HS code format (4 digits)
    if (!/^\d{4}$/.test(hsCode)) {
      return res.status(400).json({
        message: "HS code must be exactly 4 digits",
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Duplicate HS code check excluding current category
    const duplicateHS = await Category.findOne({ hsCode, _id: { $ne: id } });
    if (duplicateHS) {
      return res.status(400).json({
        message: "HS code already exists",
      });
    }

    const updateData = {
      categoryName: categoryName.trim(),
      hsCode,
    };

    if (req.file) {
      // Delete old image from Cloudinary if exists
      if (category.imagePublicId) {
        await cloudinary.uploader.destroy(category.imagePublicId);
      }
      updateData.image = req.file.path;
      updateData.imagePublicId = req.file.filename;
    }

    // If HS code changed, update subcategories' HS codes accordingly
    if (category.hsCode !== hsCode) {
      const subcategories = await Subcategory.find({ category: id });

      for (const subcategory of subcategories) {
        const subPart = subcategory.hsCode.split(".")[1];
        const newFullCode = `${hsCode}.${subPart}`;
        await Subcategory.findByIdAndUpdate(subcategory._id, {
          hsCode: newFullCode,
        });
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(id, updateData, {
      new: true,
    });

    res.status(200).json({
      message: "Category updated successfully",
      category: updatedCategory,
    });
  } catch (error) {
    console.error("Error updating category:", error.message);

    if (error.code === 11000) {
      if (error.keyPattern?.categoryName) {
        return res
          .status(400)
          .json({ message: "Category name already exists" });
      }
      if (error.keyPattern?.hsCode) {
        return res.status(400).json({ message: "HS code already exists" });
      }
    }

    res.status(500).json({ message: "Server error" });
  }
};

// DELETE CATEGORY
const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Prevent deletion if subcategories exist
    const subcategoryCount = await Subcategory.countDocuments({
      category: categoryId,
    });
    if (subcategoryCount > 0) {
      return res.status(400).json({
        message: "Cannot delete category with existing subcategories",
      });
    }

    // Delete image from Cloudinary if exists
    if (category.imagePublicId) {
      await cloudinary.uploader.destroy(category.imagePublicId);
    }

    await Category.findByIdAndDelete(categoryId);

    res.status(200).json({ message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// GET SUBCATEGORIES BY CATEGORY
const getSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const subcategories = await Subcategory.find({ category: categoryId }).populate("category");

    res.status(200).json({ success: true, subcategories });
  } catch (error) {
    console.error("Error fetching subcategories:", error.message);
    res.status(500).json({
      success: false,
      message: "Server error while retrieving subcategories",
    });
  }
};

module.exports = {
  categoryController,
  getAllCategories,
  updateCategory,
  deleteCategory,
  getSubcategoriesByCategory,
};
