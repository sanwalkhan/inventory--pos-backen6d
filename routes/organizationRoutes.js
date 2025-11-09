const express = require("express");
const router = express.Router();
const { createOrganization } = require("../controllers/organizationController");
const { authenticate } = require("../middleware/authmiddleware");

// Create organization (usually during signup)
router.post("/organizations", createOrganization);

// // Get organization by user ID
// router.get("/organizations/user/:userId", authenticate, getOrganizationByUser);

// // Get organization by admin ID
// router.get("/organizations/admin/:adminId", authenticate, getOrganizationByAdmin);

// // Get organization by ID
// router.get("/organizations/:id", authenticate, getOrganizationById);

// // Update organization
// router.put("/organizations/:id", authenticate, updateOrganization);

// // Delete organization
// router.delete("/organizations/:id", authenticate, deleteOrganization);

module.exports = router;