const bcrypt = require("bcrypt")
const User = require("../models/userModel")
const jwt = require("jsonwebtoken")

const {getOrganizationId} = require("../middleware/authmiddleware")
const getAllUsers = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    if (!organizationId) {
      return res.status(401).json({ message: "Organization ID not found in token" })
    }

    const page = Number.parseInt(req.query.page) || 1
    const limit = Number.parseInt(req.query.limit) || 8
    const search = req.query.search || ""
    const role = req.query.role

    const skip = (page - 1) * limit

    const filter = {
      organizationId,
      role: { $in: ["cashier", "manager", "supervisor"] },
    }

    if (search) {
      filter.$or = [{ username: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }]
    }

    if (role && role !== "all") {
      filter.role = role
    }

    const totalItems = await User.countDocuments(filter)
    const totalPages = Math.ceil(totalItems / limit)
    const hasNext = page < totalPages
    const hasPrev = page > 1

    const users = await User.find(filter)
      .select("-password -__v -refundPassword")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)

    const [totalUsersCount, activeUsersCount, managersCount, cashiersCount] = await Promise.all([
      User.countDocuments({ organizationId, role: { $in: ["cashier", "manager", "supervisor"] } }),
      User.countDocuments({ organizationId, role: { $in: ["cashier", "manager", "supervisor"] }, active: true }),
      User.countDocuments({ organizationId, role: "manager" }),
      User.countDocuments({ organizationId, role: "cashier" }),
    ])

    const stats = {
      total: totalUsersCount,
      active: activeUsersCount,
      managers: managersCount,
      cashiers: cashiersCount,
    }

    const pagination = {
      currentPage: page,
      totalPages,
      totalItems,
      itemsPerPage: limit,
      hasNext,
      hasPrev,
    }

    console.log("✅ Users fetched:", users.length, "out of", totalItems)

    res.status(200).json({
      users,
      pagination,
      stats,
    })
  } catch (error) {
    console.error("❌ Error fetching users:", error.message)
    res.status(500).json({
      message: "Server error while fetching users",
      error: error.message,
    })
  }
}

const updateUser = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    if (!organizationId) {
      return res.status(401).json({ message: "Organization ID not found in token" })
    }

    const userId = req.params.id

    const userToUpdate = await User.findById(userId)
    if (!userToUpdate || userToUpdate.organizationId.toString() !== organizationId.toString()) {
      return res.status(403).json({ message: "Cannot update user from different organization" })
    }

    const { username, email, password, role, active, permissions, refundPassword } = req.body

    if ((username && username.length > 100) || (email && email.length > 100) || (password && password.length > 20)) {
      return res.status(400).json({
        message: "Username and email must be ≤ 100 characters, password ≤ 20 characters.",
      })
    }

    const updateData = { username, email, role, active, permissions }

    if (password) {
      if (password.length < 8) {
        return res.status(400).json({
          message: "Password must be at least 8 characters",
        })
      }
      const salt = await bcrypt.genSalt(10)
      updateData.password = await bcrypt.hash(password, salt)
    }

    if (refundPassword) {
      if (refundPassword.length < 8) {
        return res.status(400).json({
          message: "Refund password must be at least 8 characters",
        })
      }
      const salt = await bcrypt.genSalt(10)
      updateData.refundPassword = await bcrypt.hash(refundPassword, salt)
    }

    Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key])

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    }).select("-password -__v -refundPassword")

    if (!updatedUser) {
      return res.status(404).json({ message: "User not found." })
    }

    res.status(200).json(updatedUser)
  } catch (error) {
    console.error("❌ Update user error:", error.message)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

const addUser = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    if (!organizationId) {
      return res.status(401).json({ message: "Organization ID not found in token" })
    }

    const { username, email, password, role, active, permissions, refundPassword } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "Username, email, and password are required.",
      })
    }

    if (username.length > 100 || email.length > 100 || password.length > 20) {
      return res.status(400).json({
        message: "Username and email must be ≤ 100 characters, password ≤ 20 characters.",
      })
    }

    const existingUser = await User.findOne({ email, organizationId })
    if (existingUser) {
      return res.status(409).json({ message: "User with this email already exists in your organization." })
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters",
      })
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const newUserData = {
      username,
      email,
      password: hashedPassword,
      role: role || "cashier",
      organizationId: organizationId,
      active: active !== undefined ? active : true,
      verified:true,
      permissions: permissions || [],
    }

    if (refundPassword) {
      const refundSalt = await bcrypt.genSalt(10)
      newUserData.refundPassword = await bcrypt.hash(refundPassword, refundSalt)
    }

    const newUser = new User(newUserData)
    await newUser.save()

    const { password: _, __v, refundPassword: __, ...userData } = newUser.toObject()

    res.status(201).json({
      message: "User added successfully",
      user: userData,
    })
  } catch (error) {
    console.error("❌ Add user error:", error.message)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

const deleteUser = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    if (!organizationId) {
      return res.status(401).json({ message: "Organization ID not found in token" })
    }

    const userId = req.params.id

    const userToDelete = await User.findById(userId)
    if (!userToDelete || userToDelete.organizationId.toString() !== organizationId.toString()) {
      return res.status(403).json({ message: "Cannot delete user from different organization" })
    }

    const deleted = await User.findByIdAndDelete(userId)

    if (!deleted) {
      return res.status(404).json({ message: "User not found." })
    }

    res.status(200).json({ message: "User deleted successfully." })
  } catch (error) {
    console.error("❌ Delete user error:", error.message)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

const getcurrentUser = async (req, res) => {
  try {
    const organizationId = req.organizationId || getOrganizationId(req)
    if (!organizationId) {
      return res.status(401).json({ message: "Organization ID not found in token" })
    }

    const userId = req.params.id

    const user = await User.findOne({
      _id: userId,
      organizationId,
    }).select("-password -__v -refundPassword")

    if (!user) {
      return res.status(404).json({ message: "User not found or doesn't belong to your organization." })
    }

    res.status(200).json({ user })
  } catch (error) {
    console.error("❌ Get current user error:", error.message)
    res.status(500).json({ message: "Server error", error: error.message })
  }
}

module.exports = {
  getAllUsers,
  updateUser,
  addUser,
  deleteUser,
  getcurrentUser,
}
