const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  categoryName: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  hsCode: { 
    type: String, 
    required: true, 
    unique: true, 
    match: [/^\d{4}$/, 'HS Code must be exactly 4 digits'],
    trim: true 
  },
  image: { 
    type: String 
  }, // Cloudinary secure URL
  imagePublicId: { 
    type: String 
  }, // Cloudinary public ID (needed for deletion)
}, { timestamps: true });

const Category = mongoose.model("Category", categorySchema);

module.exports = { Category };