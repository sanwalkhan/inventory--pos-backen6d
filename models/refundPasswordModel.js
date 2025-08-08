const mongoose = require("mongoose");

const refundPasswordSchema = new mongoose.Schema({
  passwordHash: { type: String, required: true },
}, { timestamps: true });

const RefundPassword = mongoose.model("RefundPassword", refundPasswordSchema);

module.exports = { RefundPassword };