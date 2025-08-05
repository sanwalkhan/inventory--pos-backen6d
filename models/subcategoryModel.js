const mongoose = require("mongoose");

const subcategorySchema = new mongoose.Schema(
  {
    subcategoryName: { type: String, required: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    image: { type: String },           // Cloudinary image URL
    imagePublicId: { type: String },  // Cloudinary public_id for deletion
  },
  { timestamps: true }
);

const Subcategory = mongoose.model("Subcategory", subcategorySchema);

module.exports = { Subcategory };
