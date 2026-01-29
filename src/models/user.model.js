// models/User.js
const mongoose = require('mongoose')

const { Schema, model } = mongoose

/**
 * OAuth Providers Schema
 */
const oauthProviderSchema = new Schema({
  provider: {
    type: String,
    enum: ['google', 'facebook', 'apple'],
    required: true,
  },
  providerId: {
    type: String,
    required: true,
  },
}, { _id: false })

/**
 * User Schema (Rider)
 * Purpose: Uber-like customer model with wallet, rides, referrals, sockets
 */
const userSchema = new Schema({

  // Identity & Contact
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
  },

  email: {
    type: String,
    required: [true, 'Email address is required'],
    lowercase: true,
    trim: true,
    match: [/.+@.+\..+/, 'Please enter a valid email address'],
  },

  phoneNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },

  // Authentication
  password: {
    type: String,
    select: false,
  },

  oauthProviders: [oauthProviderSchema],

  isVerified: {
    type: Boolean,
    default: false,
  },

  // Profile
  profilePic: {
    type: String,
  },

  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 5,
  },

  blocked: {
    type: Boolean,
    default: false,
  },

  // Saved Addresses
  addressList: [
    { type: Schema.Types.ObjectId, ref: 'Address' },
  ],

  // Ride History
  rideHistory: [
    { type: Schema.Types.ObjectId, ref: 'Ride' },
  ],

  // Wallet & Payments
  walletBalance: {
    type: Number,
    default: 0,
    min: 0,
  },

  preferredPaymentMethod: {
    type: String,
    enum: ['CASH', 'CARD', 'WALLET'],
    default: 'CASH',
  },

  // Socket.IO
  socketId: {
    type: String,
  },

  // Referral System
  referralCode: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    index: true,
  },

  referredBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  referralCodeUsed: {
    type: String,
    default: null,
  },

  totalReferrals: {
    type: Number,
    default: 0,
  },

  referralRewardsEarned: {
    type: Number,
    default: 0,
  },

  // Ride Metrics (Uber-like analytics)
  totalRides: {
    type: Number,
    default: 0,
  },

  totalSpent: {
    type: Number,
    default: 0,
  },

  cancelledRides: {
    type: Number,
    default: 0,
  },

  lastRideAt: Date,

  // Activity & Audit
  lastLogin: Date,

  isActive: {
    type: Boolean,
    default: true,
  },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
})

/**
 * Indexes
 */
userSchema.index({ email: 1 })
userSchema.index({ phoneNumber: 1 })
userSchema.index({ referralCode: 1 })

module.exports = model('User', userSchema)
