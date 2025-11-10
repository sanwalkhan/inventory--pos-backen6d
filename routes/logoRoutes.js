const express = require("express")
const logorouter = express.Router()
const { upload } = require("../config/logoCloudinary")
const logoController = require("../controllers/logoController")
const { authenticateToken } = require("../middleware/authmiddleware")

// Routes
// GET - Fetch current logo (no auth needed)
logorouter.get("/logo", logoController.getLogo)
logorouter.get("/logo/base64", logoController.getLogoBase64)

// POST - Upload new logo (requires authentication)
logorouter.post("/logo", authenticateToken, upload.single("logo"), logoController.uploadLogo)

// PUT - Update logo (admin only, deletes old from Cloudinary)
logorouter.put("/logo", authenticateToken, upload.single("logo"), logoController.updateLogo)

// DELETE - Delete logo (admin only, deletes from Cloudinary)
logorouter.delete("/logo", authenticateToken, logoController.deleteLogo)

module.exports = logorouter
