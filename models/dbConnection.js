const mongoose = require("mongoose");
require("dotenv").config({ path: "../.env" });
const dbUri = process.env.MONGO_URI;

mongoose
  .connect(dbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((error) => {
    console.log("Database Connect Errors", error);
  });

module.exports = mongoose;
