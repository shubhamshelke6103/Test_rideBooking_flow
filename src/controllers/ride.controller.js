const Ride = require('../models/ride.model')
const rideQueue = require('../queues/ride.queue')

exports.requestRide = async (req, res) => {
  console.log("before try");
  try {
    console.log("after try");
    const {
      rider,
      pickupLocation,
      dropoffLocation,
      pickupAddress,
      dropoffAddress,
      userSocketId
    } = req.body 
    console.log(req.body)

    // Validate required fields
    if (!rider || !pickupLocation?.coordinates || !dropoffLocation?.coordinates) {
      return res.status(400).json({ message: 'Missing required ride data' })
    }
    console.log("above ride create");
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
console.log("above ride queue");
    // Push ride job to Redis queue
    await rideQueue.add('ride-booking', {
      rideId: ride._id
    })
console.log("below ride create");
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
