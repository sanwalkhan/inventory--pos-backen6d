const { Subcategory } = require("../models/subcategoryModel")
const Category = require("../models/categoryModel")
const cloudinary = require("cloudinary").v2
const { getOrganizationId } = require("../middleware/authmiddleware")

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
    const organizationId = req.organizationId || getOrganizationId(req)

    const category = await Category.findOne({
      _id: categoryId,
      organizationId,
    })
    if (!category) {
      return res.status(404).json({ message: "Category not found" })
    }

    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: "Subcategory name is required" })
    }
    if (name.length > 100) {
      return res.status(400).json({
        message: "Subcategory name must not exceed 100 characters",
      })
    }

    const existingName = await Subcategory.findOne({
      organizationId,
      subcategoryName: { $regex: new RegExp(`^${name}$`, "i") },
    })
    if (existingName) {
      return res.status(400).json({ message: "Subcategory name already exists" })
    }

    if (!hsCode || hsCode.length !== 4 || !/^\d{4}$/.test(hsCode)) {
      return res.status(400).json({
        message: "Subcategory HS code must be exactly 4 digits",
      })
    }

    const fullHsCode = `${category.hsCode}.${hsCode}`

    const existingSubcategory = await Subcategory.findOne({
      organizationId,
      hsCode: fullHsCode,
    })
    if (existingSubcategory) {
      return res.status(400).json({
        message: "HS code already exists. Please choose a different code.",
      })
    }

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

    // Make image optional
    if (req.file) {
      image = req.file.path
      imagePublicId = req.file.filename
      imageSource = "file"
    } else if (imageUrl && imageUrl.trim()) {
      image = imageUrl.trim()
      imageSource = "url"
    }
    // If no image provided, empty strings will be used (optional)

    const subcategory = new Subcategory({
      organizationId,
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
      return res.status(400).json({
        message: "Duplicate entry. Please use unique values.",
      })
    }

    res.status(500).json({ message: "Server error" })
  }
}

// GET SUBCATEGORIES BY CATEGORY
const getSubcategoriesByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params
    const organizationId = req.organizationId || getOrganizationId(req)

    const subcategories = await Subcategory.find({
      category: categoryId,
      organizationId,
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
    const organizationId = req.organizationId || getOrganizationId(req)

    const subcategories = await Subcategory.find({
      organizationId,
    }).populate("category")

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
    const organizationId = req.organizationId || getOrganizationId(req)

    const subcategory = await Subcategory.findOne({
      _id: id,
      organizationId,
    }).populate("category")

    if (!subcategory) {
      return res.status(404).json({ message: "Subcategory not found" })
    }

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

      const duplicateName = await Subcategory.findOne({
        organizationId,
        subcategoryName: { $regex: new RegExp(`^${subcategoryName}$`, "i") },
        _id: { $ne: id },
      })
      if (duplicateName) {
        return res.status(400).json({
          message: "Subcategory name already exists",
        })
      }
    }

    let fullHsCode = subcategory.hsCode
    if (hsCode && /^\d{4}$/.test(hsCode)) {
      fullHsCode = `${subcategory.category.hsCode}.${hsCode}`
      const existing = await Subcategory.findOne({
        organizationId,
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

    // Handle image updates - optional
    if (req.file) {
      if (subcategory.imagePublicId && subcategory.imageSource === "file") {
        await cloudinary.uploader.destroy(subcategory.imagePublicId)
      }
      updateData.image = req.file.path
      updateData.imagePublicId = req.file.filename
      updateData.imageSource = "file"
    } else if (imageUrl && imageUrl.trim()) {
      if (subcategory.imagePublicId && subcategory.imageSource === "file") {
        await cloudinary.uploader.destroy(subcategory.imagePublicId)
      }
      updateData.image = imageUrl.trim()
      updateData.imagePublicId = ""
      updateData.imageSource = "url"
    }
    // If no image provided in update, keep existing image

    const updatedSubcategory = await Subcategory.findByIdAndUpdate(id, updateData, {
      new: true,
    }).populate("category")

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
      return res.status(400).json({
        message: "Duplicate entry. Please use unique values.",
      })
    }
    res.status(500).json({ message: "Server error" })
  }
}

// DELETE SUBCATEGORY
const deleteSubcategory = async (req, res) => {
  try {
    const { id } = req.params
    const organizationId = req.organizationId || getOrganizationId(req)

    const subcategory = await Subcategory.findOne({
      _id: id,
      organizationId,
    })
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