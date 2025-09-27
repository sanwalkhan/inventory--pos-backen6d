const mongoose = require("mongoose");

const subcategorySchema = new mongoose.Schema(
  {
    subcategoryName: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true 
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    hsCode: { 
      type: String, 
      required: true, 
      unique: true, 
      match: [/^\d{4}\.\d{4}$/, 'HS Code must be in format XXXX.XXXX (8 digits total)'],
      trim: true 
    },
    salesTax: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0
    },
    customDuty: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0
    },
    exemptions: {
      spoNo: { 
        type: String, 
        trim: true, 
        default: '' 
      },
      scheduleNo: { 
        type: String, 
        trim: true, 
        default: '' 
      },
      itemNo: { 
        type: String, 
        trim: true, 
        default: '' 
      }
    },
    unitOfMeasurement: {
      type: String,
      required: true,
      enum: [
        'kg', 'g', 'ton', 'lb', 'oz', // Weight
        'liter', 'ml', 'gallon', 'quart', // Volume
        'meter', 'cm', 'mm', 'inch', 'ft', 'yard', // Length
        'sqm', 'sqft', 'sqcm', // Area
        'piece', 'dozen', 'pair', 'set', // Count
        'box', 'pack', 'carton', 'bundle', // Package
        'hour', 'day', 'month', 'year', // Time
        'kwh', 'mwh', // Energy
        'other'
      ],
      default: 'piece'
    },
    image: { 
      type: String 
    }, // Cloudinary image URL
    imagePublicId: { 
      type: String 
    }, // Cloudinary public_id for deletion
  },
  { timestamps: true }
);

const Subcategory = mongoose.model("Subcategory", subcategorySchema);

module.exports = { Subcategory };