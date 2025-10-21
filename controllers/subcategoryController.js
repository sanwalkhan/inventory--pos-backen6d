const Subcategory = require("../models/subcategoryModel").Subcategory
const Category = require("../models/categoryModel")
const cloudinary = require("cloudinary").v2

// ADD SUBCATEGORY
const addSubcategory = async (req, res) => {
  try {
    const {
      name,
      hsCode,
      salesTax = 0,
      customDuty = 0,
      withholdingTax = 0,
      spoNo = "",
      scheduleNo = "",
      itemNo = "",
      unitOfMeasurement = "piece",
      imageUrl = "",
    } = req.body
    const { id: categoryId } = req.params

    // Check category existence
    const category = await Category.findById(categoryId)
    if (!category) {
      return res.status(404).json({ message: "Category not found" })
    }

    // Validate subcategory name
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: "Subcategory name is required" })
    }
    if (name.length > 100) {
      return res.status(400).json({
        message: "Subcategory name must not exceed 100 characters",
      })
    }

    // Check for duplicate subcategory name (case-insensitive)
    const existingName = await Subcategory.findOne({
      subcategoryName: { $regex: new RegExp(`^${name}$`, "i") },
    })
    if (existingName) {
      return res.status(400).json({ message: "Subcategory name already exists" })
    }

    // Validate subcategory HS code (4 digits)
    if (!hsCode || hsCode.length !== 4 || !/^\d{4}$/.test(hsCode)) {
      return res.status(400).json({
        message: "Subcategory HS code must be exactly 4 digits",
      })
    }

    // Create full HS code
    const fullHsCode = `${category.hsCode}.${hsCode}`

    // Check if full HS code already exists
    const existingSubcategory = await Subcategory.findOne({
      hsCode: fullHsCode,
    })
    if (existingSubcategory) {
      return res.status(400).json({
        message: "HS code already exists. Please choose a different code.",
      })
    }

    // Validate numeric fields
    const salesTaxNum = Number.parseFloat(salesTax)
    const customDutyNum = Number.parseFloat(customDuty)
    const withholdingTaxNum = Number.parseFloat(withholdingTax)

    if (isNaN(salesTaxNum) || salesTaxNum < 0 || salesTaxNum > 100) {
      return res.status(400).json({
        message: "Sales tax must be a number between 0 and 100",
      })
    }
    if (isNaN(customDutyNum) || customDutyNum < 0 || customDutyNum > 100) {
      return res.status(400).json({
        message: "Custom duty must be a number between 0 and 100",
      })
    }
    if (isNaN(withholdingTaxNum) || withholdingTaxNum < 0 || withholdingTaxNum > 100) {
      return res.status(400).json({
        message: "Withholding tax must be a number between 0 and 100",
      })
    }

    let image = ""
    let imagePublicId = ""
    let imageSource = "file"

    if (req.file) {
      // File upload via Cloudinary
      image = req.file.path
      imagePublicId = req.file.filename
      imageSource = "file"
    } else if (imageUrl && imageUrl.trim()) {
      // Direct URL input
      image = imageUrl.trim()
      imageSource = "url"
    } else {
      return res.status(400).json({
        message: "Either image file or image URL is required",
      })
    }

    const subcategory = new Subcategory({
      subcategoryName: name.trim(),
      category: categoryId,
      hsCode: fullHsCode,
      salesTax: salesTaxNum,
      customDuty: customDutyNum,
      withholdingTax: withholdingTaxNum,
      exemptions: {
        spoNo: spoNo || "",
        scheduleNo: scheduleNo || "",
        itemNo: itemNo || "",
      },
      unitOfMeasurement,
      image,
      imagePublicId,
      imageSource,
    })

    await subcategory.save()

    res.status(201).json({
      message: "Subcategory created successfully",
      subcategory,
    })
  } catch (error) {
    console.error("Error adding subcategory:", error.message)

    if (error.code === 11000) {
      if (error.keyPattern.subcategoryName) {
        return res.status(400).json({
          message: "Subcategory name already exists",
        })
      }
      if (error.keyPattern.hsCode) {
        return res.status(400).json({ message: "HS code already exists" })
      }
    }

    res.status(500).json({ message: "Server error" })
  }
}

// GET SUBCATEGORIES BY CATEGORY
const getSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params
    const subcategories = await Subcategory.find({
      category: categoryId,
    }).populate("category")
    res.status(200).json({ success: true, subcategories })
  } catch (error) {
    console.error("Error retrieving subcategories:", error.message)
    res.status(500).json({ message: "Server error" })
  }
}

// GET ALL SUBCATEGORIES
const getSubcategories = async (req, res) => {
  try {
    const subcategories = await Subcategory.find().populate("category")
    res.status(200).json({
      message: "Subcategories retrieved successfully",
      subcategories,
    })
  } catch (error) {
    console.error("Error retrieving subcategories:", error.message)
    res.status(500).json({ message: "Server error" })
  }
}

// UPDATE SUBCATEGORY
const updateSubcategory = async (req, res) => {
  try {
    const {
      name: subcategoryName,
      hsCode,
      salesTax,
      customDuty,
      withholdingTax,
      spoNo = "",
      scheduleNo = "",
      itemNo = "",
      unitOfMeasurement,
      imageUrl = "",
    } = req.body
    const { id } = req.params

    const subcategory = await Subcategory.findById(id).populate("category")
    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" })
    }

    // Validate name if provided
    if (subcategoryName !== undefined) {
      if (!subcategoryName.trim()) {
        return res.status(400).json({
          message: "Subcategory name is required",
        })
      }
      if (subcategoryName.length > 100) {
        return res.status(400).json({
          message: "Subcategory name must not exceed 100 characters",
        })
      }

      // Case-insensitive duplicate check excluding current one
      const duplicateName = await Subcategory.findOne({
        subcategoryName: { $regex: new RegExp(`^${subcategoryName}$`, "i") },
        _id: { $ne: id },
      })
      if (duplicateName) {
        return res.status(400).json({
          message: "Subcategory name already exists",
        })
      }
    }

    // Handle HS code updates
    let fullHsCode = subcategory.hsCode
    if (hsCode && /^\d{4}$/.test(hsCode)) {
      fullHsCode = `${subcategory.category.hsCode}.${hsCode}`
      const existing = await Subcategory.findOne({
        hsCode: fullHsCode,
        _id: { $ne: id },
      })
      if (existing) {
        return res.status(400).json({
          message: "HS code already exists. Please choose a different code.",
        })
      }
    } else if (hsCode) {
      return res.status(400).json({
        message: "Subcategory HS code must be exactly 4 digits",
      })
    }

    // Validate numeric fields
    const numericCheck = (val, field) => {
      const num = Number.parseFloat(val)
      if (isNaN(num) || num < 0 || num > 100) {
        throw new Error(`${field} must be a number between 0 and 100`)
      }
      return num
    }

    const updateData = {
      ...(subcategoryName && {
        subcategoryName: subcategoryName.trim(),
      }),
      ...(hsCode && { hsCode: fullHsCode }),
      ...(salesTax !== undefined && {
        salesTax: numericCheck(salesTax, "Sales tax"),
      }),
      ...(customDuty !== undefined && {
        customDuty: numericCheck(customDuty, "Custom duty"),
      }),
      ...(withholdingTax !== undefined && {
        withholdingTax: numericCheck(withholdingTax, "Withholding tax"),
      }),
      ...(unitOfMeasurement && { unitOfMeasurement }),
      exemptions: {
        spoNo: spoNo || "",
        scheduleNo: scheduleNo || "",
        itemNo: itemNo || "",
      },
    }

    if (req.file) {
      // Delete old Cloudinary image if it was a file upload
      if (subcategory.imagePublicId && subcategory.imageSource === "file") {
        await cloudinary.uploader.destroy(subcategory.imagePublicId)
      }
      updateData.image = req.file.path
      updateData.imagePublicId = req.file.filename
      updateData.imageSource = "file"
    } else if (imageUrl && imageUrl.trim()) {
      // Update with new URL
      if (subcategory.imagePublicId && subcategory.imageSource === "file") {
        await cloudinary.uploader.destroy(subcategory.imagePublicId)
      }
      updateData.image = imageUrl.trim()
      updateData.imagePublicId = ""
      updateData.imageSource = "url"
    }

    const updatedSubcategory = await Subcategory.findByIdAndUpdate(id, updateData, { new: true }).populate("category")

    res.status(200).json({
      message: "Subcategory updated successfully",
      subcategory: updatedSubcategory,
    })
  } catch (error) {
    console.error("Error updating subcategory:", error.message)
    if (error.message.includes("must be a number")) {
      return res.status(400).json({ message: error.message })
    }
    if (error.code === 11000) {
      if (error.keyPattern.subcategoryName) {
        return res.status(400).json({
          message: "Subcategory name already exists",
        })
      }
      if (error.keyPattern.hsCode) {
        return res.status(400).json({ message: "HS code already exists" })
      }
    }
    res.status(500).json({ message: "Server error" })
  }
}

// DELETE SUBCATEGORY
const deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params
    const subcategory = await Subcategory.findById(id)
    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" })
    }

    if (subcategory.imagePublicId && subcategory.imageSource === "file") {
      await cloudinary.uploader.destroy(subcategory.imagePublicId)
    }

    await Subcategory.findByIdAndDelete(id)

    res.status(200).json({
      message: "Subcategory deleted successfully",
      subcategory,
    })
  } catch (error) {
    console.error("Error deleting subcategory:", error.message)
    res.status(500).json({ message: "Server error" })
  }
}

module.exports = {
  addSubcategory,
  getSubcategories,
  getSubcategoriesByCategory,
  updateSubcategory,
  deleteSubcategory,
}
