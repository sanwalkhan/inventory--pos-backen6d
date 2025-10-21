const express = require("express")
const productRouter = express.Router()
const upload = require("../config/productCloudinary")
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
} = require("../controllers/productController")

// GET routes
productRouter.get("/products", getProducts)
productRouter.get("/productswithstock", getProductWithStock)
productRouter.get("/products/search", getproductByname)
productRouter.get("/products/barcode", getProductByBarcode)
productRouter.get("/productsSubcategories", getProductsBySubCategory)
productRouter.get("/products/subcategory/:subcategoryId", getProductsModel)
productRouter.get("/products/productsCategories", getProductBycategory)
productRouter.get("/counteachproductorder", countEachProductOrder)

// POST route - accepts both multipart (file) and JSON (URL) requests
productRouter.post("/products", upload.single("image"), addProduct)

// PUT route - accepts both multipart (file) and JSON (URL) requests
productRouter.put("/products/:id", upload.single("image"), updateProduct)

// DELETE route
productRouter.delete("/products/:id", deleteProduct)

module.exports = productRouter
