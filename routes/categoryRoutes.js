const express = require("express")
const categoryRouter = express.Router()
const upload = require("../config/categoryCloudinary")
const {
  categoryController,
  getAllCategories,
  updateCategory,
  deleteCategory,
  getSubcategoriesByCategory,
} = require("../controllers/categoryController")

// Accepts either multipart/form-data with image file or application/json with imageUrl
categoryRouter.post("/category", upload.single("image"), categoryController)

// GET all categories
categoryRouter.get("/categories", getAllCategories)

categoryRouter.put("/category/:id", upload.single("image"), updateCategory)

// DELETE category
categoryRouter.delete("/category/:id", deleteCategory)

// GET subcategories by category
categoryRouter.get("/subcategories/category/:categoryId", getSubcategoriesByCategory)

module.exports = categoryRouter
