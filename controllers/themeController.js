const Theme = require("../models/themeModel");
const { getOrganizationId } = require("../middleware/authmiddleware")

exports.getTheme = async (req, res) => {
  const organizationId = req.organizationId || getOrganizationId(req)
  if (!organizationId) {
    return res.status(401).json({ error: "Organization ID is missing" })
  }
  try {
    let theme = await Theme.findOne({organizationId});
    if (!theme) {
      // Create default theme if not exists
      theme = new Theme({
        name: "Default",
        primaryColor: "#f97316",
        secondaryColor: "#64748b",
        mainSectionBackground: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
        subSectionBackground: "#ffffff",
        cardColor: "#ffffff",
        cardHeaderColor: "#f97316",
        modalColor: "#ffffff",
        modalCrossBackgroundColor: "#ef4444",
        modalCrossColor: "#ffffff",
        mainTextColor: "#1e293b",
        subTextColor: "#64748b",
        buttonBackground: "#f97316",
        buttonTextColor: "#ffffff",
        buttonHoverBackground: "#ea580c",
        buttonHoverTextColor: "#fff7ed",
        sidebarBackground: "linear-gradient(180deg, #1e293b 0%, #334155 100%)",
        sidebarLinkColor: "#cbd5e1",
        sidebarLinkHoverColor: "#ffffff",
        sidebarLinkHoverBackground: "#f97316",
        sidebarActiveBackground: "#f97316",
        sidebarActiveLinkColor: "#ffffff",
        organizationId: organizationId,
      });
      await theme.save();
    }
    res.json(theme);
  } catch (error) {
    console.error("Failed to get theme", error);
    res.status(500).json({ error: "Server error" });
  }
};
exports.getThemeUnAuthenticated = async (req, res) => {
  try {
    let theme = await Theme.findOne();
    if (!theme) {
      // Create default theme if not exists
      theme = new Theme({
        name: "Default",
        primaryColor: "#f97316",
        secondaryColor: "#64748b",
        mainSectionBackground: "linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)",
        subSectionBackground: "#ffffff",
        cardColor: "#ffffff",
        cardHeaderColor: "#f97316",
        modalColor: "#ffffff",
        modalCrossBackgroundColor: "#ef4444",
        modalCrossColor: "#ffffff",
        mainTextColor: "#1e293b",
        subTextColor: "#64748b",
        buttonBackground: "#f97316",
        buttonTextColor: "#ffffff",
        buttonHoverBackground: "#ea580c",
        buttonHoverTextColor: "#fff7ed",
        sidebarBackground: "linear-gradient(180deg, #1e293b 0%, #334155 100%)",
        sidebarLinkColor: "#cbd5e1",
        sidebarLinkHoverColor: "#ffffff",
        sidebarLinkHoverBackground: "#f97316",
        sidebarActiveBackground: "#f97316",
        sidebarActiveLinkColor: "#ffffff",
      });
      await theme.save();
    }
    res.json(theme);
  } catch (error) {
    console.error("Failed to get theme", error);
    res.status(500).json({ error: "Server error" });
  }
};

exports.updateTheme = async (req, res) => {
  const organizationId = req.organizationId || getOrganizationId(req)
  if (!organizationId) {
    return res.status(401).json({ error: "Organization ID is missing" })
  }
  try {
    let theme = await Theme.findOne({organizationId});
    if (!theme) {
      theme = new Theme();
    }

    // Overwrite existing theme properties from request body
    Object.keys(req.body).forEach((key) => {
      if (theme.schema.paths[key]) {
        theme[key] = req.body[key];
      }
    });

    await theme.save();
    res.json(theme);
  } catch (error) {
    console.error("Failed to update theme", error);
    res.status(500).json({ error: "Server error" });
  }
};
