const mongoose = require('mongoose');

const currencySchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
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
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      unique: true,
   
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Currency", currencySchema);
