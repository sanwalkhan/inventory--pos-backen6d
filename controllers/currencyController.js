const Currency = require('../models/currancyModel');

module.exports = {
 updateCurrency: async (req, res) => {
    try {
      const { code, symbol, name } = req.body;
      if (!code || !symbol || !name) {
        return res.status(400).json({ message: 'All fields are required' });
      }
      console.log("Updating currency to:", { code, symbol, name });

      // Use upsert to create the doc if it doesn't exist
      const currency = await Currency.findOneAndUpdate(
        {},
        { code, symbol, name },
        { new: true, upsert: true }
      );

      // Use io if available, or req.io if you attach it via middleware
      if (req.io) {
        req.io.emit("currencyUpdated", currency);
      } else {
        console.warn("req.io not set, socket event not emitted");
      }

      res.json({ message: "Currency updated successfully", currency });
    } catch (error) {
      console.error("Error updating currency:", error);
      res.status(500).json({ message: "Server error", error: error.message });
    }
  },

  getCurrancy: async (req, res) => {
    try {
      const currancy = await Currency.findOne({});
      res.json(currancy);
    } catch (error) {
      console.error("Error fetching currency:", error);
      res.status(500).json({ message: "Server error" });
    }
  }
};
