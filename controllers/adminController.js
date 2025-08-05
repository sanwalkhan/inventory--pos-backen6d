
const userModel = require("../models/userModel");


const getUsers = async (req, res) => {
  try {
    const users = await userModel.find({ role: "cashier" });
    res.status(200).json({ message: "Users retrieved successfully", users });
  } catch (error) {
    console.error("Error retrieving users:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};
const updatedUser = async (req, res) => {
  const { username } = req.body;
  const { id } = req.params;

  if (!username) {
    return res.status(400).json({ message: "Category name is required" });
  }

  const updateData = { username };

  const user = await userModel.findByIdAndUpdate(id, updateData, {
    new: true,
  });
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  return res.status(200).json({ message: "User updated successfully", user });
};
const deleteUser = async (req, res) => {
  try {
    const user = await userModel.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: "User deleted successfully", user });
  } catch (error) {
    console.error("Error deleting user:", error.message);
    res.status(500).json({ message: "Server error" });
  }
};




// Controller function

module.exports = {
  getUsers,
  updatedUser,
  deleteUser,
};
