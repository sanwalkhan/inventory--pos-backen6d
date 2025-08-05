const { Subcategory } = require("../models/subcategoryModel");
const { Category } = require("../models/categoryModel");
const cloudinary = require("cloudinary").v2;

// ADD SUBCATEGORY
const addSubcategory = async (req, res) => {
  try {
    const { name } = req.body;
    const { id: categoryId } = req.params;

    // Check category exists
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Require image for new subcategory (optional, can be removed if image is optional)
    if (!req.file) {
      return res.status(400).json({ message: "Image is required" });
    }

    const image = req.file.path;
    const imagePublicId = req.file.filename;

    const subcategory = new Subcategory({
      subcategoryName: name,
      category: categoryId,
      image,
      imagePublicId,
    });

    await subcategory.save();

    res.status(201).json({
      message: "Subcategory created successfully",
      subcategory,
    });
  } catch (error) {
    console.error("Error adding subcategory:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// GET SUBCATEGORIES BY CATEGORY (usually used to list subcategories of a category)
const getSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const subcategories = await Subcategory.find({ category: categoryId });
    res.status(200).json({ success: true, subcategories });
  } catch (error) {
    console.error("Error retrieving subcategories:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL SUBCATEGORIES (if you want)
const getSubcategories = async (req, res) => {
  try {
    const subcategories = await Subcategory.find();
    res.status(200).json({ message: "Subcategories retrieved successfully", subcategories });
  } catch (error) {
    console.error("Error retrieving subcategories:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE SUBCATEGORY
const updateSubcategory = async (req, res) => {
  try {
    console.log("req.body:", req.body);

    // Accept the name field sent from frontend as subcategoryName
    const { name: subcategoryName } = req.body;
    const { id } = req.params;

    if (!subcategoryName) {
      return res.status(400).json({ message: "Subcategory name is required" });
    }

    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" });
    }

    const updateData = { subcategoryName };

    if (req.file) {
      if (subcategory.imagePublicId) {
        await cloudinary.uploader.destroy(subcategory.imagePublicId);
      }
      updateData.image = req.file.path;
      updateData.imagePublicId = req.file.filename;
    }

    const updatedSubcategory = await Subcategory.findByIdAndUpdate(id, updateData, { new: true });

    res.status(200).json({
      message: "Subcategory updated successfully",
      subcategory: updatedSubcategory,
    });
  } catch (error) {
    console.error("Error updating subcategory:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};



// DELETE SUBCATEGORY
const deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;

    // Find subcategory by ID
    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" });
    }

    // Delete image from Cloudinary if exists
    if (subcategory.imagePublicId) {
      await cloudinary.uploader.destroy(subcategory.imagePublicId);
    }

    // Delete subcategory document
    await Subcategory.findByIdAndDelete(id);

    res.status(200).json({ message: "Subcategory deleted successfully", subcategory });
  } catch (error) {
    console.error("Error deleting subcategory:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};


module.exports = {
  addSubcategory,
  getSubcategories,
  getSubcategoriesByCategory,
  updateSubcategory,
  deleteSubcategory,
};
