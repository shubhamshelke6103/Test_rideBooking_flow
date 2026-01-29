// models/Driver.js
const mongoose = require('mongoose')

const { Schema, model } = mongoose

const driverSchema = new Schema({

  // Identity
  fullName: {
    type: String,
    required: true,
    trim: true,
  },

  phoneNumber: {
    type: String,
    unique: true,
    required: true,
  },

  email: {
    type: String,
    lowercase: true,
    trim: true,
  },

  password: {
    type: String,
    select: false,
  },

  profilePic: String,

  // Vehicle Info
  vehicle: {
    type: {
      type: String,
      enum: ['BIKE', 'AUTO', 'CAR', 'SUV'],
      default: 'CAR',
    },
    model: String,
    numberPlate: String,
    color: String,
  },

  // Live status
  socketId: String,

  isOnline: {
    type: Boolean,
    default: false,
  },

  currentLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [lng, lat]
      default: [0, 0],
    },
  },

  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 5,
  },

  totalRides: {
    type: Number,
    default: 0,
  },

  earnings: {
    type: Number,
    default: 0,
  },

  isVerified: {
    type: Boolean,
    default: false,
  },

  blocked: {
    type: Boolean,
    default: false,
  },

  lastRideAt: Date,

}, {
  timestamps: true,
})

driverSchema.index({ currentLocation: '2dsphere' })

module.exports = model('Driver', driverSchema)
