const Ride = require('../models/ride.model')
const rideQueue = require('../queues/ride.queue')

exports.requestRide = async (req, res) => {
  try {
    const {
      rider,
      pickupLocation,
      dropoffLocation,
      pickupAddress,
      dropoffAddress,
      userSocketId
    } = req.body

    // Validate required fields
    if (!rider || !pickupLocation?.coordinates || !dropoffLocation?.coordinates) {
      return res.status(400).json({ message: 'Missing required ride data' })
    }

    // Create ride
    const ride = await Ride.create({
      rider,
      pickupLocation,
      dropoffLocation,
      pickupAddress,
      dropoffAddress,
      userSocketId,
      status: 'requested'
    })

    console.log('🚕 Ride Created:', ride._id)

    // Push ride job to Redis queue
    await rideQueue.add('ride-booking', {
      rideId: ride._id
    })

    return res.json({
      success: true,
      message: 'Ride created. Searching driver...',
      rideId: ride._id
    })

  } catch (err) {
    console.error('❌ Ride Error:', err)
    return res.status(500).json({ error: err.message })
  }
}
