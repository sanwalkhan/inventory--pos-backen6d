const express = require("express");
const subcategoryRouter = express.Router();
const upload = require("../config/subcategoryCloudinary");
const {
  addSubcategory,
  getSubcategories,
  getSubcategoriesByCategory,
  deleteSubcategory,
  updateSubcategory,
} = require("../controllers/subcategoryController");

subcategoryRouter.get("/subcategories", getSubcategories);
subcategoryRouter.get("/subcategories/category/:categoryId", getSubcategoriesByCategory);
subcategoryRouter.post("/category/:id/subcategories", upload.single("image"), addSubcategory);
subcategoryRouter.put("/subcategory/:id", upload.single("image"), updateSubcategory);
subcategoryRouter.delete("/subcategory/:id", deleteSubcategory);

module.exports = subcategoryRouter;
