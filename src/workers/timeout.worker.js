const redis = require('../config/redis')
const Ride = require('../models/ride.model')

console.log('⏳ Timeout Worker Running...')

setInterval(async () => {
  const keys = await redis.keys('ride:timeout:*')

  for (let key of keys) {
    const rideId = key.split(':')[2]

    const ride = await Ride.findById(rideId)
    if (!ride || ride.status !== 'requested') {
      await redis.del(key)
      continue
    }

    await Ride.findByIdAndUpdate(rideId, {
      status: 'cancelled',
      cancelledBy: 'system',
      cancellationReason: 'Timeout'
    })

    // ✅ Publish cancel event
    await redis.publish('socket-events', JSON.stringify({
      type: 'ride_cancelled_user',
      socketId: ride.userSocketId,
      payload: { message: 'Ride timed out' }
    }))

    await redis.del(key)
  }
}, 5000)
