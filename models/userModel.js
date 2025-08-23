const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ["admin", "cashier", "manager", "supervisor"],
    default: "cashier",
  },
  email: { type: String, required: true, trim: true, unique: true },
  active: { type: Boolean, default: true }, // true = active, false = deactivated
  permissions: [{ type: String }], // list of functionalities assigned e.g. ['orders','reports', 'inventory']
  refundPassword: { type: String, default: "" },
});

module.exports = mongoose.model("Users", userSchema);
