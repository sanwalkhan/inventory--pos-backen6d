const mongoose = require("mongoose")

const categorySchema = new mongoose.Schema(
  {
    categoryName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    hsCode: {
      type: String,
      required: true,
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
    organizationId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Organization",
          required: function() {
            return true;
          }
        },
  },
  { timestamps: true },
)

// Index for faster queries
categorySchema.index({ categoryName: 1, organizationId: 1 }, { unique: true });
categorySchema.index({ hsCode: 1, organizationId: 1 }, { unique: true });

module.exports = mongoose.model("Category", categorySchema)
