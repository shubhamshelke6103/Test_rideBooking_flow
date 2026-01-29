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

    console.log(`⌛ Ride Timeout: ${rideId}`)

    await Ride.findByIdAndUpdate(rideId, {
      status: 'cancelled',
      cancelledBy: 'system',
      cancellationReason: 'No driver accepted in 30 seconds'
    })

    global.io.to(ride.userSocketId).emit('ride_cancelled', {
      message: 'No driver accepted your ride'
    })

    await redis.del(key)
  }
}, 5000)
