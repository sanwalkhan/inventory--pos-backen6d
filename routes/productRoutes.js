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
const {authenticateToken} = require("../middleware/authmiddleware")

// GET routes
productRouter.get("/products",authenticateToken, getProducts)
productRouter.get("/productswithstock",authenticateToken, getProductWithStock)
productRouter.get("/products/search",authenticateToken, getproductByname)
productRouter.get("/products/barcode",authenticateToken, getProductByBarcode)
productRouter.get("/productsSubcategories",authenticateToken, getProductsBySubCategory)
productRouter.get("/products/subcategory/:subcategoryId",authenticateToken, getProductsModel)
productRouter.get("/products/productsCategories",authenticateToken, getProductBycategory)
productRouter.get("/counteachproductorder",authenticateToken, countEachProductOrder)

// POST route - accepts both multipart (file) and JSON (URL) requests
productRouter.post("/products",authenticateToken, upload.single("image"), addProduct)

// PUT route - accepts both multipart (file) and JSON (URL) requests
productRouter.put("/products/:id",authenticateToken, upload.single("image"), updateProduct)

// DELETE route
productRouter.delete("/products/:id",authenticateToken, deleteProduct)

module.exports = productRouter
