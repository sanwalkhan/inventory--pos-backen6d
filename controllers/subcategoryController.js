const { Subcategory } = require("../models/subcategoryModel");
const { Category } = require("../models/categoryModel");
const cloudinary = require("cloudinary").v2;

// GENERATE NEXT AVAILABLE SUBCATEGORY HS CODE
const generateSubcategoryHsCode = async (categoryHsCode) => {
  // Find all subcategories with the same category HS code prefix
  const existingSubcategories = await Subcategory.find({
    hsCode: { $regex: `^${categoryHsCode}\\.` }
  }).sort({ hsCode: 1 });

  if (existingSubcategories.length === 0) {
    return `${categoryHsCode}.0001`;
  }

  // Find the highest subcategory code
  let maxSubCode = 0;
  for (const sub of existingSubcategories) {
    const [, subCodeStr] = sub.hsCode.split('.');
    const subCode = parseInt(subCodeStr, 10);
    if (subCode > maxSubCode) {
      maxSubCode = subCode;
    }
  }

  // Generate next code
  const nextCode = maxSubCode + 1;
  return `${categoryHsCode}.${nextCode.toString().padStart(4, '0')}`;
};

// ADD SUBCATEGORY
const addSubcategory = async (req, res) => {
  try {
    const { 
      name, 
      salesTax = 0, 
      customDuty = 0, 
      spoNo = '', 
      scheduleNo = '', 
      itemNo = '', 
      unitOfMeasurement = 'piece' 
    } = req.body;
    const { id: categoryId } = req.params;

    // Check category exists
    const category = await Category.findById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Validate numeric fields
    const salesTaxNum = parseFloat(salesTax);
    const customDutyNum = parseFloat(customDuty);

    if (isNaN(salesTaxNum) || salesTaxNum < 0 || salesTaxNum > 100) {
      return res.status(400).json({ 
        message: "Sales tax must be a number between 0 and 100" 
      });
    }

    if (isNaN(customDutyNum) || customDutyNum < 0 || customDutyNum > 100) {
      return res.status(400).json({ 
        message: "Custom duty must be a number between 0 and 100" 
      });
    }

    // Require image for new subcategory
    if (!req.file) {
      return res.status(400).json({ message: "Image is required" });
    }

    // Generate HS code for subcategory
    const hsCode = await generateSubcategoryHsCode(category.hsCode);

    const image = req.file.path;
    const imagePublicId = req.file.filename;

    const subcategory = new Subcategory({
      subcategoryName: name,
      category: categoryId,
      hsCode,
      salesTax: salesTaxNum,
      customDuty: customDutyNum,
      exemptions: {
        spoNo: spoNo || '',
        scheduleNo: scheduleNo || '',
        itemNo: itemNo || ''
      },
      unitOfMeasurement,
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
    
    if (error.code === 11000) {
      if (error.keyPattern.subcategoryName) {
        return res.status(400).json({ message: "Subcategory name already exists" });
      }
      if (error.keyPattern.hsCode) {
        return res.status(400).json({ message: "HS code already exists" });
      }
    }
    
    res.status(500).json({ message: "Server error" });
  }
};

// GET SUBCATEGORIES BY CATEGORY
const getSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const subcategories = await Subcategory.find({ category: categoryId })
      .populate('category');
    res.status(200).json({ success: true, subcategories });
  } catch (error) {
    console.error("Error retrieving subcategories:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// GET ALL SUBCATEGORIES
const getSubcategories = async (req, res) => {
  try {
    const subcategories = await Subcategory.find().populate('category');
    res.status(200).json({ 
      message: "Subcategories retrieved successfully", 
      subcategories 
    });
  } catch (error) {
    console.error("Error retrieving subcategories:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};

// UPDATE SUBCATEGORY
const updateSubcategory = async (req, res) => {
  try {
    const { 
      name: subcategoryName, 
      salesTax, 
      customDuty, 
      spoNo = '', 
      scheduleNo = '', 
      itemNo = '', 
      unitOfMeasurement 
    } = req.body;
    const { id } = req.params;

    if (!subcategoryName) {
      return res.status(400).json({ message: "Subcategory name is required" });
    }

    // Validate numeric fields
    if (salesTax !== undefined) {
      const salesTaxNum = parseFloat(salesTax);
      if (isNaN(salesTaxNum) || salesTaxNum < 0 || salesTaxNum > 100) {
        return res.status(400).json({ 
          message: "Sales tax must be a number between 0 and 100" 
        });
      }
    }

    if (customDuty !== undefined) {
      const customDutyNum = parseFloat(customDuty);
      if (isNaN(customDutyNum) || customDutyNum < 0 || customDutyNum > 100) {
        return res.status(400).json({ 
          message: "Custom duty must be a number between 0 and 100" 
        });
      }
    }

    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" });
    }

    const updateData = { 
      subcategoryName,
      ...(salesTax !== undefined && { salesTax: parseFloat(salesTax) }),
      ...(customDuty !== undefined && { customDuty: parseFloat(customDuty) }),
      ...(unitOfMeasurement && { unitOfMeasurement }),
      exemptions: {
        spoNo: spoNo || '',
        scheduleNo: scheduleNo || '',
        itemNo: itemNo || ''
      }
    };

    if (req.file) {
      if (subcategory.imagePublicId) {
        await cloudinary.uploader.destroy(subcategory.imagePublicId);
      }
      updateData.image = req.file.path;
      updateData.imagePublicId = req.file.filename;
    }

    const updatedSubcategory = await Subcategory.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true }
    ).populate('category');

    res.status(200).json({
      message: "Subcategory updated successfully",
      subcategory: updatedSubcategory,
    });
  } catch (error) {
    console.error("Error updating subcategory:", error.message);
    
    if (error.code === 11000) {
      if (error.keyPattern.subcategoryName) {
        return res.status(400).json({ message: "Subcategory name already exists" });
      }
    }
    
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE SUBCATEGORY
const deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params;

    const subcategory = await Subcategory.findById(id);
    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" });
    }

    // Delete image from Cloudinary if exists
    if (subcategory.imagePublicId) {
      await cloudinary.uploader.destroy(subcategory.imagePublicId);
    }

    await Subcategory.findByIdAndDelete(id);

    res.status(200).json({ 
      message: "Subcategory deleted successfully", 
      subcategory 
    });
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