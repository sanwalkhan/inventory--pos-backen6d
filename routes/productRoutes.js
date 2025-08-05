const express = require("express");
const productRouter = express.Router();
const upload = require("../config/productCloudinary");
const {
  getProducts,
  addProduct,
  deleteProduct,
  updateProduct,
  getProductsBySubCategory,
  getProductsModel,
} = require("../controllers/productController");

productRouter.get("/products", getProducts);
productRouter.post("/products", upload.single("image"), addProduct);  // POST with image upload

productRouter.delete("/products/:id", deleteProduct);

productRouter.put("/products/:id", upload.single("image"), updateProduct);  // PUT with optional image upload
productRouter.get(
  "/productsSubcategories",
  getProductsBySubCategory
);
productRouter.get("/products/subcategory/:subcategoryId", getProductsModel);

module.exports = productRouter;
