const mongoose = require("mongoose")

const subcategorySchema = new mongoose.Schema(
  {
    subcategoryName: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    hsCode: {
      type: String,
      required: true,
      match: [/^\d{4}\.\d{4}$/, "HS Code must be in format XXXX.XXXX (8 digits total)"],
      trim: true,
    },
    salesTax: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    customDuty: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    withholdingTax: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      default: 0,
    },
    exemptions: {
      spoNo: {
        type: String,
        trim: true,
        default: "",
      },
      scheduleNo: {
        type: String,
        trim: true,
        default: "",
      },
      itemNo: {
        type: String,
        trim: true,
        default: "",
      },
    },
    unitOfMeasurement: {
      type: String,
      required: true,
      enum: [
        "kg",
        "g",
        "ton",
        "lb",
        "oz",
        "liter",
        "ml",
        "gallon",
        "quart",
        "meter",
        "cm",
        "mm",
        "inch",
        "ft",
        "yard",
        "sqm",
        "sqft",
        "sqcm",
        "piece",
        "dozen",
        "pair",
        "set",
        "box",
        "pack",
        "carton",
        "bundle",
        "hour",
        "day",
        "month",
        "year",
        "kwh",
        "mwh",
        "other",
      ],
      default: "piece",
    },
    image: {
      type: String,
    },
    imageSource: {
      type: String,
      enum: ["file", "url"],
      default: "file",
    },
    organizationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Organization",
          required: function() {
            return true;
          }
        },
    imagePublicId: {
      type: String,
    },
  },
  { timestamps: true },
)
// In subcategoryModel.js
subcategorySchema.index({ subcategoryName: 1, organizationId: 1 }, { unique: true });
subcategorySchema.index({ hsCode: 1, organizationId: 1 }, { unique: true });
const Subcategory = mongoose.model("Subcategory", subcategorySchema)

module.exports = { Subcategory }
