const express = require("express");
const categoryRouter = express.Router();
const upload = require("../config/categoryCloudinary");
const {
  categoryController,
  getAllCategories,
  updateCategory,
  deleteCategory,
  getSubcategoriesByCategory,
} = require("../controllers/categoryController");

// POST category with image upload
categoryRouter.post("/category", upload.single("image"), categoryController);

// GET all categories
categoryRouter.get("/categories", getAllCategories);

// PUT update category with optional new image upload
categoryRouter.put("/category/:id", upload.single("image"), updateCategory);

// DELETE category
categoryRouter.delete("/category/:id", deleteCategory);

// GET subcategories by category
categoryRouter.get("/subcategories/category/:categoryId", getSubcategoriesByCategory);

module.exports = categoryRouter;
