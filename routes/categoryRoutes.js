const express = require("express")
const categoryRouter = express.Router()
const upload = require("../config/categoryCloudinary")
const {
  categoryController,
  getAllCategories,
  getPaginatedCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
  getSubcategoriesByCategory,
  getPaginatedSubcategoriesByCategory,
  searchCategories,
  getCategoriesWithSubcategories,
  getSubcategoriesWithProducts,
} = require("../controllers/categoryController")
const { authenticateToken } = require("../middleware/authmiddleware")

// Accepts either multipart/form-data with image file or application/json with imageUrl
categoryRouter.post("/category", authenticateToken, upload.single("image"), categoryController)

// GET all categories
categoryRouter.get("/categories", authenticateToken, getAllCategories)

// GET paginated categories
categoryRouter.get("/categories/paginated", authenticateToken, getPaginatedCategories)

// GET categories with subcategories (subcategory count > 0)
categoryRouter.get("/categories/with-subcategories", authenticateToken, getCategoriesWithSubcategories)

// GET subcategories with products (product count > 0)
categoryRouter.get("/subcategories/with-products/:categoryId", authenticateToken, getSubcategoriesWithProducts)

// GET category by ID
categoryRouter.get("/category/:id", authenticateToken, getCategoryById)

// UPDATE category
categoryRouter.put("/category/:id", authenticateToken, upload.single("image"), updateCategory)

// DELETE category
categoryRouter.delete("/category/:id", authenticateToken, deleteCategory)

// GET subcategories by category
categoryRouter.get("/subcategories/category/:categoryId", authenticateToken, getSubcategoriesByCategory)

// GET paginated subcategories by category
categoryRouter.get("/subcategories/category/:categoryId/paginated", authenticateToken, getPaginatedSubcategoriesByCategory)

// SEARCH categories
categoryRouter.get("/categories/search", authenticateToken, searchCategories)

module.exports = categoryRouter