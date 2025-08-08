const mongoose = require("mongoose");
const { Category } = require("./categoryModel");
const { Subcategory } = require("./subcategoryModel");

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true , unique: true , trim: true},
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    barcode: { type: String, required: true , unique: true, trim: true},
    sellingPrice: { type: Number, required: true },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    subcategoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subcategory",
      required: true,
    },
    image: { type: String },           // Cloudinary image URL
    imagePublicId: { type: String },  // Cloudinary public_id for deletion
  },
  { timestamps: true }
);

const Products = mongoose.model("Products", ProductSchema);

module.exports = { Category, Subcategory, Products };
