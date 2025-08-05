// categoryModel.js
const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  categoryName: { type: String, required: true },
  image: { type: String }, // Cloudinary secure URL
  imagePublicId: { type: String }, // Cloudinary public ID (needed for deletion)
}, { timestamps: true });

const Category = mongoose.model("Category", categorySchema);

module.exports = { Category };
