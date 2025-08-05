const { Products } = require("../models/productModel");
const getInventory = async (req, res) => {
  try {
    const inventory = await Products.find({})
      .populate("categoryId", "categoryName")
      .populate("subcategoryId", "subcategoryName");
    console.log(inventory);
    res.status(200).json({ inventory });
  } catch (error) {
    console.error("Error fetching inventory:", error);
    res.status(500).json({ message: "Failed to fetch inventory" });
  }
};
module.exports = { getInventory };
