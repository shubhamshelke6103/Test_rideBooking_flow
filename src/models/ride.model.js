const mongoose = require('mongoose')
const { randomInt } = require('crypto')

// Secure 4-digit OTP generator
const genOtp = () => String(randomInt(1000, 10000))

const rideSchema = new mongoose.Schema({

  // Rider & Driver
  rider: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },

  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver',
    default: null,
  },

  // Address
  pickupAddress: String,
  dropoffAddress: String,

  // Pickup Location (GeoJSON)
  pickupLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
    },
  },

  // Dropoff Location (GeoJSON)
  dropoffLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: true,
    },
  },

  // Socket IDs
  driverSocketId: String,
  userSocketId: String,

  // Fare & Distance
  fare: Number,
  distanceInKm: Number,

  // Ride Status
  status: {
    type: String,
    enum: ['requested', 'accepted', 'in_progress', 'completed', 'cancelled'],
    default: 'requested',
    index: true,
  },

  // Ride Type
  rideType: {
    type: String,
    enum: ['normal', 'whole_day', 'custom'],
    default: 'normal',
  },

  // Booking Mode
  bookingType: {
    type: String,
    enum: ['INSTANT', 'FULL_DAY', 'RENTAL', 'DATE_WISE'],
    default: 'INSTANT',
  },

  // Booking Metadata
  bookingMeta: {
    startTime: Date,
    endTime: Date,
    days: Number,
    dates: [Date],
  },

  // Cancellation
  cancelledBy: {
    type: String,
    enum: ['rider', 'driver', 'system'],
    default: null,
  },

  cancellationReason: {
    type: String,
    maxlength: 500,
  },

  cancellationFee: {
    type: Number,
    default: 0,
  },

  refundAmount: {
    type: Number,
    default: 0,
  },

  // Backward Compatible Custom Schedule
  customSchedule: {
    startDate: Date,
    endDate: Date,
    startTime: String,
    endTime: String,
  },

  // Ride OTP
  startOtp: {
    type: String,
    default: genOtp,
  },

  stopOtp: {
    type: String,
    default: genOtp,
  },

  // Payment
  paymentMethod: {
    type: String,
    enum: ['CASH', 'RAZORPAY', 'WALLET'],
    default: 'CASH',
  },

  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded', 'partial'],
    default: 'pending',
  },

  transactionId: String,

  razorpayPaymentId: {
    type: String,
    default: null,
  },

  walletAmountUsed: {
    type: Number,
    default: 0,
    min: 0,
  },

  razorpayAmountPaid: {
    type: Number,
    default: 0,
    min: 0,
  },

  // Ride Timing
  actualStartTime: Date,
  actualEndTime: Date,
  estimatedDuration: Number,
  actualDuration: Number,
  estimatedArrivalTime: Date,
  driverArrivedAt: Date,

  // Ratings
  riderRating: {
    type: Number,
    min: 1,
    max: 5,
  },

  driverRating: {
    type: Number,
    min: 1,
    max: 5,
  },

  // Promotions
  tips: {
    type: Number,
    default: 0,
  },

  discount: {
    type: Number,
    default: 0,
  },

  promoCode: String,

  // Driver Matching Tracking
  rejectedDrivers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver'
  }],

  notifiedDrivers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Driver'
  }],

}, {
  timestamps: true
})

// Indexes for performance
rideSchema.index({ status: 1, createdAt: -1 })
rideSchema.index({ pickupLocation: '2dsphere' })
rideSchema.index({ dropoffLocation: '2dsphere' })

// Auto-update timestamp
rideSchema.pre('save', function (next) {
  this.updatedAt = Date.now()
})

module.exports = mongoose.model('Ride', rideSchema)
