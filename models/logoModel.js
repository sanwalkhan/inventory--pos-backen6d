const mongoose = require("mongoose")

const logoSchema = new mongoose.Schema(
  {
    logoUrl: {
      type: String,
      required: true,
      description: "Cloudinary URL of the logo image",
    },
    cloudinaryPublicId: {
      type: String,
      required: true,
      description: "Cloudinary public ID for deletion purposes",
    },
    fileName: {
      type: String,
      required: true,
      description: "Original file name of the logo",
    },
    fileSize: {
      type: Number,
      required: true,
      description: "File size in bytes",
    },
    mimeType: {
      type: String,
      required: true,
      enum: ["image/jpeg", "image/png", "image/heic"],
      description: "MIME type of the logo file",
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
      description: "Organization ID of the logo",
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      description: "User ID who uploaded the logo",
    },
    createdAt: {
      type: Date,
      default: Date.now,
      description: "Timestamp when logo was created",
    },
    updatedAt: {
      type: Date,
      default: Date.now,
      description: "Timestamp when logo was last updated",
    },
  },
  {
    timestamps: true,
    collection: "logos",
  },
)

// Index for faster queries
logoSchema.index({ uploadedBy: 1 })
logoSchema.index({ createdAt: -1 })

module.exports = mongoose.model("Logo", logoSchema)
