// src/controllers/user.controller.js
const User = require('../models/user.model')

/**
 * CREATE USER
 */
exports.createUser = async (req, res) => {
  try {
    const { fullName, email, phoneNumber, password } = req.body

    if (!fullName || !email) {
      return res.status(400).json({ message: 'Full name & email are required' })
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { phoneNumber }]
    })

    if (existingUser) {
      return res.status(409).json({ message: 'User already exists' })
    }

    const user = await User.create({
      fullName,
      email,
      phoneNumber,
      password
    })

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * GET ALL USERS
 */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find({ isActive: true }).sort({ createdAt: -1 })

    res.json({
      success: true,
      count: users.length,
      users
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * GET USER BY ID
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({
      success: true,
      user
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * UPDATE USER
 */
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({
      success: true,
      message: 'User updated successfully',
      user
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

/**
 * DELETE USER (SOFT DELETE)
 */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    )

    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    res.json({
      success: true,
      message: 'User deactivated successfully'
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}
