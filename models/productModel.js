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
    },
    barcode: { 
      type: String, 
      required: true, 
      unique: true, 
      trim: true 
    },
    sellingPriceWithoutDiscount: { 
      type: Number, 
      required: true 
    },
    sellingPrice: { 
      type: Number, 
      required: true 
    },
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
    hsCode: {
      type: String,
      required: true,
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
    withholdingTax: { 
      type: Number, 
      required: true,
      min: 0,
      max: 100,
      default: 0
    },
    marginPercent: { 
      type: Number, 
      required: true,
      min: 0,
      max: 100 
    },
    discount: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 100 
    },
    // ADD THESE FIELDS:
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
        'kg', 'g', 'ton', 'lb', 'oz',
        'liter', 'ml', 'gallon', 'quart',
        'meter', 'cm', 'mm', 'inch', 'ft', 'yard',
        'sqm', 'sqft', 'sqcm',
        'piece', 'dozen', 'pair', 'set',
        'box', 'pack', 'carton', 'bundle',
        'hour', 'day', 'month', 'year',
        'kwh', 'mwh',
        'other'
      ],
      default: 'piece'
    },
    image: { 
      type: String 
    },
    imagePublicId: { 
      type: String 
    },
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