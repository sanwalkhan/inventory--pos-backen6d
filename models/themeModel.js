const mongoose = require("mongoose");

const ThemeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    primaryColor: { type: String, required: true },
    secondaryColor: { type: String, required: true },

    mainSectionBackground: { type: String, required: true, default: "#ffffff" },
    subSectionBackground: { type: String, required: true, default: "#f3f4f6" },
    cardColor: { type: String, required: true, default: "#ffffff" },
    cardHeaderColor: { type: String, required: true, default: "#1f2937" },
    modalColor: { type: String, required: true, default: "#ffffff" },
    modalCrossBackgroundColor: { type: String, required: true, default: "#ef4444" },
    modalCrossColor: { type: String, required: true, default: "#ffffff" },
    mainTextColor: { type: String, required: true, default: "#111827" },
    subTextColor: { type: String, required: true, default: "#6b7280" },
    buttonBackground: { type: String, required: true, default: "#3b82f6" },
    buttonTextColor: { type: String, required: true, default: "#ffffff" },
    buttonHoverBackground: { type: String, required: true, default: "#2563eb" },
    buttonHoverTextColor: { type: String, required: true, default: "#ffffff" },
    sidebarBackground: { type: String, required: true, default: "#111827" },
    sidebarLinkColor: { type: String, required: true, default: "#9ca3af" },
    sidebarLinkHoverColor: { type: String, required: true, default: "#f9fafb" },
    sidebarLinkHoverBackground: { type: String, required: true, default: "#374151" },
    sidebarActiveBackground: { type: String, required: true, default: "#2563eb" },
    sidebarActiveLinkColor: { type: String, required: true, default: "#ffffff" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Theme", ThemeSchema);
