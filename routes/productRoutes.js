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
  getProductBycategory,
  getProductByBarcode,
  getProductWithStock,
  countEachProductOrder,
} = require("../controllers/productController");

productRouter.get("/products", getProducts);
productRouter.get("/productswithstock", getProductWithStock);
productRouter.post("/products", upload.single("image"), addProduct);
productRouter.delete("/products/:id", deleteProduct);
productRouter.get("/products/search", getproductByname);
productRouter.get("/products/barcode", getProductByBarcode);
productRouter.put("/products/:id", upload.single("image"), updateProduct);
productRouter.get("/productsSubcategories", getProductsBySubCategory);
productRouter.get("/products/subcategory/:subcategoryId", getProductsModel);
productRouter.get("/products/productsCategories", getProductBycategory);
productRouter.get("/counteachproductorder", countEachProductOrder);

module.exports = productRouter;
