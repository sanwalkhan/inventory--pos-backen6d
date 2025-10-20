// dbConnection.js
const mongoose = require("mongoose");
require("dotenv").config(); // Ensure .env is at the root

const dbUri = process.env.MONGO_URI;

mongoose
  .connect(dbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000, // 30s timeout for cloud
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((error) => console.error("❌ Database connection error:", error));

// Export mongoose connection
module.exports = mongoose;

// Optional: listen for connection errors after initial connect
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

mongoose.connection.once("open", () => {
  console.log("MongoDB connection is open");
});
