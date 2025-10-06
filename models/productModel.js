const mongoose = require("mongoose");
const { Category } = require("./categoryModel");
const { Subcategory } = require("./subcategoryModel");

const ProductSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true 
    },
    quantity: { 
      type: Number, 
      required: true 
    },
    price: { 
      type: Number, 
      required: true 
    }, // Cost price
    barcode: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true 
    },
    sellingPriceWithoutDiscount: { 
      type: Number, 
      required: true 
    }, // Price with taxes and margin but before discount
    sellingPrice: { 
      type: Number, 
      required: true 
    }, // Final selling price after discount
    description: { 
      type: String, 
      required: false, 
      trim: true 
    },
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
    // HS Code from subcategory (8 digits: XXXX.XXXX)
    hsCode: {
      type: String,
      required: true,
      match: [/^\d{4}\.\d{4}$/, 'HS Code must be in format XXXX.XXXX (8 digits total)'],
      trim: true
    },
    // Tax rates from subcategory
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
    withholdingTax: { 
      type: Number, 
      required: true,
      min: 0,
      max: 100,
      default: 0
    },
    // User-entered margin percentage
    marginPercent: { 
      type: Number, 
      required: true,
      min: 0,
      max: 100 
    },
    // Discount percentage
    discount: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
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

// Virtual for calculating total tax percentage
ProductSchema.virtual('totalTaxPercent').get(function() {
  return (this.salesTax || 0) + (this.customDuty || 0) + (this.withholdingTax || 0);
});

// Virtual for calculating savings amount
ProductSchema.virtual('savingsAmount').get(function() {
  return this.sellingPriceWithoutDiscount - this.sellingPrice;
});

// Include virtuals when converting to JSON
ProductSchema.set('toJSON', { virtuals: true });
ProductSchema.set('toObject', { virtuals: true });

const Products = mongoose.model("Products", ProductSchema);

module.exports = { Products };