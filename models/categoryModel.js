const mongoose = require("mongoose")

const categorySchema = new mongoose.Schema(
  {
    categoryName: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
    },
    hsCode: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{4}$/,
    },
    image: {
      type: String,
      default: null,
    },
    imagePublicId: {
      type: String,
      default: null,
    },
    imageSource: {
      type: String,
      enum: ["file", "url"],
      default: "file",
    },
  },
  { timestamps: true },
)

// Index for faster queries
categorySchema.index({ categoryName: 1, hsCode: 1 })

module.exports = mongoose.model("Category", categorySchema)
