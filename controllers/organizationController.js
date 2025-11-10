const Organization = require("../models/organizationModel");
const User = require("../models/userModel");
const { authenticateToken , getOrganizationId } = require("../middleware/authmiddleware");



const getOrganizationByUser = async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    
    if (!organizationId) {
      return res.status(400).json({
        message: "Organization ID not found in token",
      });
    }

    const organization = await Organization.findById(organizationId);
    
    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    res.status(200).json({
      organization: {
        id: organization._id,
        name: organization.name,
      },
    });
  } catch (error) {
    console.error("❌ Get organization by user error:", error.message);
    res.status(500).json({
      message: "Server error while fetching organization",
      error: error.message,
    });
  }
};

const updateOrganization = async (req, res) => {
  try {
    const { name } = req.body;
   const organizationId = getOrganizationId(req)
    const organization = await Organization.findById(organizationId);

    if (!organization) {
      return res.status(404).json({
        message: "Organization not found",
      });
    }

    // Check if name is being changed and if it already exists
    if (name && name !== organization.name) {
      const existingOrganization = await Organization.findOne({ 
        name, 
        _id: { $ne: organizationId } 
      });
      if (existingOrganization) {
        return res.status(409).json({
          message: "Organization name already exists",
        });
      }
    }

    // Update fields
    if (name) organization.name = name.trim();

    organization.updatedAt = Date.now();

    await organization.save();

    res.status(200).json({
      message: "Organization updated successfully",
      organization: {
        id: organization._id,
        name: organization.name,
        updatedAt: organization.updatedAt,
      },
    });
  } catch (error) {
    console.error("❌ Update organization error:", error.message);
    res.status(500).json({
      message: "Server error while updating organization",
      error: error.message,
    });
  }
};

module.exports = {
  getOrganizationByUser,
  updateOrganization,

 };