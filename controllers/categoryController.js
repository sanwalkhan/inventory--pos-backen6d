const { Category } = require("../models/categoryModel");
const { Subcategory } = require("../models/subcategoryModel");
const cloudinary = require("cloudinary").v2;

const categoryController = async (req, res) => {
  try {
    const { categoryName } = req.body;
    if (!categoryName || !req.file) {
      return res.status(400).json({ message: "Category name and image are required" });
    }

    const image = req.file.path;
    const imagePublicId = req.file.filename; // multer-storage-cloudinary sets public_id here

    const newCategory = new Category({ categoryName, image, imagePublicId });
    await newCategory.save();

    res.status(201).json({ message: "Category added successfully", category: newCategory });
  } catch (error) {
    console.error("Add category error:", error);
    res.status(500).json({ message: "Server error" });
  }
};


const getAllCategories = async (req, res) => {
  try {
    const categories = await Category.find();
    res.status(200).json({ message: "Categories retrieved successfully", categories });
  } catch (error) {
    console.error("Error retrieving categories:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

const updateCategory = async (req, res) => {
  try {
    const { categoryName } = req.body;
    const { id } = req.params;

    if (!categoryName) {
      return res.status(400).json({ message: "Category name is required" });
    }

    const category = await Category.findById(id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    const updateData = { categoryName };

    if (req.file) {
      // Delete old image from Cloudinary if it exists
      if (category.imagePublicId) {
        await cloudinary.uploader.destroy(category.imagePublicId);
      }
      updateData.image = req.file.path;
      updateData.imagePublicId = req.file.filename;
    }

    const updatedCategory = await Category.findByIdAndUpdate(id, updateData, { new: true });

    res.status(200).json({ message: "Category updated successfully", category: updatedCategory });
  } catch (error) {
    console.error("Error updating category:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};


const deleteCategory = async (req, res) => {
  try {
    const categoryId = req.params.id;

    // Optionally, check if subcategories exist here (you already do in frontend also)
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
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
    const subcategories = await Subcategory.find({ category: categoryId }).populate("category");
    res.status(200).json({ success: true, subcategories });
  } catch (error) {
    console.error("Error fetching subcategories:", error.message);
    res.status(500).json({ success: false, message: "Server error while retrieving subcategories" });
  }
};

module.exports = {
  categoryController,
  getAllCategories,
  updateCategory,
  deleteCategory,
  getSubcategoriesByCategory,
};
