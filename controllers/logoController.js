const fs = require("fs")
const { cloudinary } = require("../config/logoCloudinary")
const Logo = require("../models/logoModel")
const { getOrganizationId } = require("../middleware/authmiddleware")

// ✅ Get current logo
exports.getLogo = async (req, res) => {
  try {
    console.log("[v0] GET /logo - Fetching logo")
    const organizationId = req.organizationId || getOrganizationId(req)
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    // FIX: Add organization filter
    const logo = await Logo.findOne({ organizationId }).sort({ createdAt: -1 })
    if (!logo) {
      console.log("[v0] No logo found in database for organization:", organizationId)
      return res.status(404).json({
        success: false,
        message: "No logo found for this organization",
      })
    }

    console.log("[v0] Logo fetched successfully:", logo.logoUrl)
    return res.status(200).json({
      success: true,
      logoUrl: logo.logoUrl,
      fileName: logo.fileName,
      fileSize: logo.fileSize,
      mimeType: logo.mimeType,
      createdAt: logo.createdAt,
      updatedAt: logo.updatedAt,
      _id: logo._id,
    })
  } catch (error) {
    console.error("[v0] Error fetching logo:", error.message)
    return res.status(500).json({
      success: false,
      message: "Error fetching logo",
      error: error.message,
    })
  }
}

// ✅ Get logo as base64
exports.getLogoBase64 = async (req, res) => {
  try {
    console.log("[v0] GET /logo/base64 - Fetching logo as base64")
    const organizationId = req.organizationId || getOrganizationId(req)
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    // FIX: Add organization filter
    const logo = await Logo.findOne({ organizationId }).sort({ createdAt: -1 })
    if (!logo) {
      console.log("[v0] No logo found in database for organization:", organizationId)
      return res.status(404).json({
        success: false,
        message: "No logo found for this organization",
      })
    }

    // Fetch the image from Cloudinary and convert to base64
    const response = await fetch(logo.logoUrl)
    if (!response.ok) {
      throw new Error("Failed to fetch logo from Cloudinary")
    }

    const buffer = await response.buffer()
    const base64 = buffer.toString("base64")
    const mimeType = response.headers.get("content-type") || "image/png"

    console.log("[v0] Logo converted to base64 successfully")
    res.set("Access-Control-Allow-Origin", "*")
    
    return res.status(200).json({
      success: true,
      base64: `data:${mimeType};base64,${base64}`,
      fileName: logo.fileName,
    })
  } catch (error) {
    console.error("[v0] Error converting logo to base64:", error.message)
    return res.status(500).json({
      success: false,
      message: "Error converting logo to base64",
      error: error.message,
    })
  }
}

// ✅ Upload new logo
exports.uploadLogo = async (req, res) => {
  console.log("POST /logo - uploadLogo called")
  console.log("User authenticated:", !!req.user)
  console.log("File received:", !!req.file)
  
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    if (!req.user) {
      console.log("Authentication failed - no user")
      return res.status(403).json({
        success: false,
        message: "You need to login first",
      })
    }

    if (!req.file) {
      console.log("No file provided")
      return res.status(400).json({
        success: false,
        message: "No file provided",
      })
    }

    // Check if logo already exists for this organization
    const existingLogo = await Logo.findOne({ organizationId })
    if (existingLogo) {
      console.log("Logo already exists for organization, use update instead")
      return res.status(400).json({
        success: false,
        message: "Logo already exists. Use update instead.",
      })
    }

    console.log("Uploading to Cloudinary...")
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "logos",
      resource_type: "image",
      public_id: `logo_${organizationId}_${Date.now()}`,
      tags: ["logo", `org_${organizationId}`],
    })

    // Clean up local file
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }

    console.log("user from logoController", req.user)
    const logo = new Logo({
      logoUrl: uploadResult.secure_url,
      cloudinaryPublicId: uploadResult.public_id,
      fileName: req.file.originalname,
      organizationId,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user.userId,
    })

    await logo.save()

    console.log("[v0] Logo uploaded successfully:", logo.logoUrl)
    return res.status(201).json({
      success: true,
      message: "Logo uploaded successfully",
      logoUrl: logo.logoUrl,
      _id: logo._id,
    })
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    console.error("[v0] Error uploading logo:", error.message)
    return res.status(500).json({
      success: false,
      message: "Error uploading logo",
      error: error.message,
    })
  }
}

// ✅ Update logo
exports.updateLogo = async (req, res) => {
  console.log("PUT /logo - updateLogo called")
  console.log("User authenticated:", !!req.user)
  console.log("User role:", req.user?.role)
  console.log("File received:", !!req.file)
  
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    if (!req.user || req.user.role !== "admin") {
      console.log("Authorization failed - not admin")
      return res.status(403).json({
        success: false,
        message: "Only admin can update logo",
      })
    }

    if (!req.file) {
      console.log("No file provided")
      return res.status(400).json({
        success: false,
        message: "No file provided",
      })
    }

    // FIX: Find by organizationId
    const existingLogo = await Logo.findOne({ organizationId })
    if (existingLogo) {
      console.log("Deleting old logo from Cloudinary:", existingLogo.cloudinaryPublicId)
      try {
        await cloudinary.uploader.destroy(existingLogo.cloudinaryPublicId)
      } catch (err) {
        console.error("[v0] Warning: Could not delete old logo:", err.message)
      }
    }

    console.log("Uploading new logo to Cloudinary...")
    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: "logos",
      resource_type: "image",
      public_id: `logo_${organizationId}_${Date.now()}`,
      tags: ["logo", `org_${organizationId}`],
    })

    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }

    let logo
    if (existingLogo) {
      logo = await Logo.findByIdAndUpdate(
        existingLogo._id,
        {
          logoUrl: uploadResult.secure_url,
          cloudinaryPublicId: uploadResult.public_id,
          fileName: req.file.originalname,
          fileSize: req.file.size,
          organizationId,
          mimeType: req.file.mimetype,
          uploadedBy: req.user.userId,
          updatedAt: new Date(),
        },
        { new: true },
      )
    } else {
      logo = new Logo({
        logoUrl: uploadResult.secure_url,
        cloudinaryPublicId: uploadResult.public_id,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        organizationId,
        mimeType: req.file.mimetype,
        uploadedBy: req.user.userId, // FIX: Changed from req.user._id to req.user.userId
      })
      await logo.save()
    }

    console.log("Logo updated successfully:", logo.logoUrl)
    return res.status(200).json({
      success: true,
      message: "Logo updated successfully",
      logoUrl: logo.logoUrl,
      _id: logo._id,
    })
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path)
    }
    console.error("Error updating logo:", error.message)
    return res.status(500).json({
      success: false,
      message: "Error updating logo",
      error: error.message,
    })
  }
}

// ✅ Delete logo
exports.deleteLogo = async (req, res) => {
  console.log("DELETE /logo - deleteLogo called")
  console.log("User authenticated:", !!req.user)
  console.log("User role:", req.user?.role)
  
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        message: "Organization ID is required",
      })
    }

    if (!req.user || req.user.role !== "admin") {
      console.log("Authorization failed - not admin")
      return res.status(403).json({
        success: false,
        message: "Only admin can delete logo",
      })
    }

    // FIX: Find by organizationId
    const logo = await Logo.findOne({ organizationId })
    if (!logo) {
      console.log("No logo found to delete for organization:", organizationId)
      return res.status(404).json({
        success: false,
        message: "No logo found to delete",
      })
    }

    console.log("Deleting logo from Cloudinary:", logo.cloudinaryPublicId)
    await cloudinary.uploader.destroy(logo.cloudinaryPublicId)
    await Logo.findByIdAndDelete(logo._id)

    console.log("Logo deleted successfully")
    return res.status(200).json({
      success: true,
      message: "Logo deleted successfully",
    })
  } catch (error) {
    console.error("[v0] Error deleting logo:", error.message)
    return res.status(500).json({
      success: false,
      message: "Error deleting logo",
      error: error.message,
    })
  }
}