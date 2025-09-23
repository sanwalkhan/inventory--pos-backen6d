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
  getproductByname,
 getProductByBarcode,
 getProductWithStock,
 countEachProductOrder
} = require("../controllers/productController");

productRouter.get("/products", getProducts);
productRouter.get("/productswithstock",getProductWithStock);
productRouter.post("/products", upload.single("image"), addProduct);  // POST with image upload

productRouter.delete("/products/:id", deleteProduct);
productRouter.get("/products/search", getproductByname);
productRouter.get("/products/barcode", getProductByBarcode);
productRouter.put("/products/:id", upload.single("image"), updateProduct);  // PUT with optional image upload
productRouter.get(
  "/productsSubcategories",
  getProductsBySubCategory
);
productRouter.get("/products/subcategory/:subcategoryId", getProductsModel);
productRouter.get("/products/productsCategories", getProductsModel);
productRouter.get("/counteachproductorder", countEachProductOrder);

module.exports = productRouter;
