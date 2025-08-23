const Users = require("../models/userModel");

// GET /manager/permissions/:userId
exports.getPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await Users.findById(userId).select("permissions");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.status(200).json({ permissions: user.permissions || [] });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
