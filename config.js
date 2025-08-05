require("dotenv").config({ path: ".env" });
module.exports = {
  mongoURI: process.env.MONGO_URI,
  jwtConfig: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE || "1d",
  },
};
