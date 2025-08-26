const Theme = require('../models/themeModel');

exports.getTheme = async (req, res) => {
  try {
    let theme = await Theme.findOne();
    if (!theme) {
      theme = new Theme();
      await theme.save();
    }
    res.json(theme);
  } catch (error) {
    console.error('Failed to get theme', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateTheme = async (req, res) => {
  const {
    mainSectionBackground,
    subSectionBackground,
    cardColor,
    cardHeaderColor,
    modalColor,
    modalCrossBackgroundColor,
    modalCrossColor,
    mainTextColor,
    subTextColor,

    buttonBackground,
    buttonTextColor,
    buttonHoverBackground,
    buttonHoverTextColor,
  } = req.body;

  try {
    let theme = await Theme.findOne();
    if (!theme) theme = new Theme();

    theme.mainSectionBackground = mainSectionBackground || theme.mainSectionBackground;
    theme.subSectionBackground = subSectionBackground || theme.subSectionBackground;
    theme.cardColor = cardColor || theme.cardColor;
    theme.cardHeaderColor = cardHeaderColor || theme.cardHeaderColor;
    theme.modalColor = modalColor || theme.modalColor;
    theme.modalCrossBackgroundColor = modalCrossBackgroundColor || theme.modalCrossBackgroundColor;
    theme.modalCrossColor = modalCrossColor || theme.modalCrossColor;
    theme.mainTextColor = mainTextColor || theme.mainTextColor;
    theme.subTextColor = subTextColor || theme.subTextColor;

    theme.buttonBackground = buttonBackground || theme.buttonBackground;
    theme.buttonTextColor = buttonTextColor || theme.buttonTextColor;
    theme.buttonHoverBackground = buttonHoverBackground || theme.buttonHoverBackground;
    theme.buttonHoverTextColor = buttonHoverTextColor || theme.buttonHoverTextColor;

    await theme.save();
    res.json(theme);
  } catch (error) {
    console.error('Failed to update theme', error);
    res.status(500).json({ error: 'Server error' });
  }
};
