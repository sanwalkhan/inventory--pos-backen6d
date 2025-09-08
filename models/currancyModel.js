const mongoose = require('mongoose');

const currencySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      default: "PKR"
    },
    symbol: {
      type: String,
      required: true,
      default: "Rs"
    },
    name: {
      type: String,
      required: true,
      default: "Pakistani Rupee"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Currency", currencySchema);
