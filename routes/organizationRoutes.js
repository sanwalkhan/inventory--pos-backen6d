const express = require("express");
const router = express.Router();
const { 
  getOrganizationByUser,
  updateOrganization
} = require("../controllers/organizationController");
const { authenticate } = require("../middleware/authmiddleware");
// Get current user's organization
router.get("/organizations/user", authenticate, getOrganizationByUser);
// Update current user's organization
router.put("/organizations", authenticate, updateOrganization);

module.exports = router;