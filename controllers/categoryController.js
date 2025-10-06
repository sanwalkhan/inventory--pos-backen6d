const { Category } = require("../models/categoryModel");
const { Subcategory } = require("../models/subcategoryModel");
const cloudinary = require("cloudinary").v2;

const categoryController = async (req, res) => {
  try {
    const { categoryName, hsCode } = req.body;
    
    if (!categoryName || !hsCode || !req.file) {
      return res.status(400).json({ 
        message: "Category name, HS code, and image are required" 
      });
    }

    // Validate HS code format (4 digits)
    if (!/^\d{4}$/.test(hsCode)) {
      return res.status(400).json({ 
        message: "HS code must be exactly 4 digits" 
      });
    }

    const image = req.file.path;
    const imagePublicId = req.file.filename;

    const newCategory = new Category({ 
      categoryName, 
      hsCode,
      image, 
      imagePublicId 
    });
    
    await newCategory.save();

    res.status(201).json({ 
      message: "Category added successfully", 
      category: newCategory 
    });
  } catch (error) {
    console.error("Add category error:", error);
    
    if (error.code === 11000) {
      if (error.keyPattern.categoryName) {
        return res.status(400).json({ message: "Category name already exists" });
      }
      if (error.keyPattern.hsCode) {
        return res.status(400).json({ message: "HS code already exists" });
      }
    }
    
    res.status(500).json({ message: "Server error" });
  }
};

const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json({ 
      message: "Categories retrieved successfully", 
      categories 
    });
  } catch (error) {
    console.error("Error retrieving categories:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { categoryName, hsCode } = req.body;
    const { id } = req.params;

    if (!categoryName || !hsCode) {
      return res.status(400).json({ 
        message: "Category name and HS code are required" 
      });
    }

    // Validate HS code format (4 digits)
    if (!/^\d{4}$/.test(hsCode)) {
      return res.status(400).json({ 
        message: "HS code must be exactly 4 digits" 
      });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const updateData = { categoryName, hsCode };

    if (req.file) {
      // Delete old image from Cloudinary if it exists
      if (category.imagePublicId) {
        await cloudinary.uploader.destroy(category.imagePublicId);
      }
      updateData.image = req.file.path;
      updateData.imagePublicId = req.file.filename;
    }

    // If HS code is changing, update all related subcategories
    if (category.hsCode !== hsCode) {
      const subcategories = await Subcategory.find({ category: id });
      
      for (const subcategory of subcategories) {
        // Extract the subcategory part (last 4 digits after the dot)
        const subcategoryCode = subcategory.hsCode.split('.')[1];
        const newSubHsCode = `${hsCode}.${subcategoryCode}`;
        
        await Subcategory.findByIdAndUpdate(subcategory._id, { 
          hsCode: newSubHsCode 
        });
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(id, updateData, { 
      new: true 
    });

    res.status(200).json({ 
      message: "Category updated successfully", 
      category: updatedCategory 
    });
  } catch (error) {
    console.error("Error updating category:", error.message);
    
    if (error.code === 11000) {
      if (error.keyPattern.categoryName) {
        return res.status(400).json({ message: "Category name already exists" });
      }
      if (error.keyPattern.hsCode) {
        return res.status(400).json({ message: "HS code already exists" });
      }
    }
    
    res.status(500).json({ message: "Server error" });
  }
};

const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Check if subcategories exist
    const subcategoryCount = await Subcategory.countDocuments({ category: categoryId });
    if (subcategoryCount > 0) {
      return res.status(400).json({ 
        message: "Cannot delete category with existing subcategories" 
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

const getSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const subcategories = await Subcategory.find({ category: categoryId })
      .populate("category");
    res.status(200).json({ success: true, subcategories });
  } catch (error) {
    console.error("Error fetching subcategories:", error.message);
    res.status(500).json({ 
      success: false, 
      message: "Server error while retrieving subcategories" 
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