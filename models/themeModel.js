const mongoose = require('mongoose');

const ThemeSchema = new mongoose.Schema({
  mainSectionBackground: { type: String, default: '#ffffff' },
  subSectionBackground: { type: String, default: '#f0f0f0' },
  cardColor: { type: String, default: '#ffffff' },
  cardHeaderColor: { type: String, default: '#e0e0e0' },
  modalColor: { type: String, default: '#ffffff' },
  modalCrossBackgroundColor: { type: String, default: '#000000' },
  modalCrossColor: { type: String, default: '#ffffff' },
  mainTextColor: { type: String, default: '#000000' },
  subTextColor: { type: String, default: '#666666' },

  buttonBackground: { type: String, default: '#3b82f6' },
  buttonTextColor: { type: String, default: '#ffffff' },
  buttonHoverBackground: { type: String, default: '#2563eb' },
  buttonHoverTextColor: { type: String, default: '#d1d5db' },
}, { timestamps: true });

module.exports = mongoose.model('Theme', ThemeSchema);
