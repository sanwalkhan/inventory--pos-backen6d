const Organization = require("../models/organizationModel");
const User = require("../models/userModel");

// ==========================
// 📍 Create Organization
// ==========================
const createOrganization = async (req, res) => {
  try {
    const { name, userId, adminId } = req.body;

    if (!name || !userId || !adminId) {
      return res.status(400).json({
        message: "Organization name, user ID, and admin ID are required",
      });
    }

    // Check if organization name already exists
    const existingOrganization = await Organization.findOne({ name });
    if (existingOrganization) {
      return res.status(409).json({
        message: "Organization name already exists",
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // Check if admin exists
    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        message: "Admin user not found",
      });
    }

    // Create organization
    const organization = new Organization({
      name: name.trim(),
      userId,
      adminId,
    });

    await organization.save();

    res.status(201).json({
      message: "Organization created successfully",
      organization: {
        id: organization._id,
        name: organization.name,
        userId: organization.userId,
        adminId: organization.adminId,
        isActive: organization.isActive,
        createdAt: organization.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ Create organization error:", error.message);
    res.status(500).json({
      message: "Server error while creating organization",
      error: error.message,
    });
  }
};

// ==========================
// 📍 Get Organization by User ID
// ==========================
// const getOrganizationByUser = async (req, res) => {
//   try {
//     const { userId } = req.params;

//     const organization = await Organization.findOne({ userId })
//       .populate("userId", "username email role")
//       .populate("adminId", "username email");

//     if (!organization) {
//       return res.status(404).json({
//         message: "Organization not found for this user",
//       });
//     }

//     res.status(200).json({
//       organization,
//     });
//   } catch (error) {
//     console.error("❌ Get organization by user error:", error.message);
//     res.status(500).json({
//       message: "Server error while fetching organization",
//       error: error.message,
//     });
//   }
// };

// ==========================
// 📍 Get Organization by Admin ID
// ==========================
// const getOrganizationByAdmin = async (req, res) => {
//   try {
//     const { adminId } = req.params;

//     const organizations = await Organization.find({ adminId })
//       .populate("userId", "username email role active")
//       .sort({ createdAt: -1 });

//     res.status(200).json({
//       organizations,
//       count: organizations.length,
//     });
//   } catch (error) {
//     console.error("❌ Get organizations by admin error:", error.message);
//     res.status(500).json({
//       message: "Server error while fetching organizations",
//       error: error.message,
//     });
//   }
// };

// ==========================
// 📍 Get Organization by ID
// ==========================
// const getOrganizationById = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const organization = await Organization.findById(id)
//     if (!organization) {
//       return res.status(404).json({
//         message: "Organization not found",
//       });
//     }

//     res.status(200).json({
//       organization,
//     });
//   } catch (error) {
//     console.error("❌ Get organization by ID error:", error.message);
//     res.status(500).json({
//       message: "Server error while fetching organization",
//       error: error.message,
//     });
//   }
// };

// ==========================
// 📍 Update Organization
// ==========================
// const updateOrganization = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { name, isActive } = req.body;

//     const updateData = {};
//     if (name) updateData.name = name.trim();
//     if (isActive !== undefined) updateData.isActive = isActive;

//     if (Object.keys(updateData).length === 0) {
//       return res.status(400).json({
//         message: "No valid fields to update",
//       });
//     }

//     // Check if organization name already exists (excluding current organization)
//     if (name) {
//       const existingOrganization = await Organization.findOne({
//         name: name.trim(),
//         _id: { $ne: id },
//       });
//       if (existingOrganization) {
//         return res.status(409).json({
//           message: "Organization name already exists",
//         });
//       }
//     }

//     const organization = await Organization.findByIdAndUpdate(id, updateData, {
//       new: true,
//       runValidators: true,
//     })
//       .populate("userId", "username email role")
//       .populate("adminId", "username email");

//     if (!organization) {
//       return res.status(404).json({
//         message: "Organization not found",
//       });
//     }

//     res.status(200).json({
//       message: "Organization updated successfully",
//       organization,
//     });
//   } catch (error) {
//     console.error("❌ Update organization error:", error.message);
//     res.status(500).json({
//       message: "Server error while updating organization",
//       error: error.message,
//     });
//   }
// };

// ==========================
// 📍 Delete Organization
// ==========================
// const deleteOrganization = async (req, res) => {
//   try {
//     const { id } = req.params;

//     const organization = await Organization.findByIdAndDelete(id);

//     if (!organization) {
//       return res.status(404).json({
//         message: "Organization not found",
//       });
//     }

//     res.status(200).json({
//       message: "Organization deleted successfully",
//     });
//   } catch (error) {
//     console.error("❌ Delete organization error:", error.message);
//     res.status(500).json({
//       message: "Server error while deleting organization",
//       error: error.message,
//     });
//   }
// };

module.exports = {
  createOrganization

 };