const express = require("express")
const subcategoryRouter = express.Router()
const upload = require("../config/subcategoryCloudinary")
const {
  addSubcategory,
  getSubcategories,
  getSubcategoriesByCategory,
  deleteSubcategory,
  updateSubcategory,
} = require("../controllers/subcategoryController")

// GET all subcategories
subcategoryRouter.get("/subcategories", getSubcategories)



// For file upload: use multipart/form-data with image file
// For URL: use application/json with imageUrl field
subcategoryRouter.post("/category/:id/subcategories", upload.single("image"), addSubcategory)

subcategoryRouter.put("/subcategory/:id", upload.single("image"), updateSubcategory)

// DELETE subcategory
subcategoryRouter.delete("/subcategory/:id", deleteSubcategory)

module.exports = subcategoryRouter
