const { Worker } = require('bullmq')

const redisApp = require('../config/redis')

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
}

const Ride = require('../models/ride.model')
const Driver = require('../models/driver.model')

const SEARCH_RADII = [3000, 6000, 9000, 12000]
const ACCEPT_TIMEOUT = 30

console.log("🚀 Ride Worker Starting...")

const worker = new Worker(
  'ride-booking',
  async job => {
    const { rideId } = job.data
    console.log(`🚕 Processing Ride Job: ${rideId}`)

    let ride = await Ride.findById(rideId)
    if (!ride || ride.status !== 'requested') return

    const [lng, lat] = ride.pickupLocation.coordinates

    for (let radius of SEARCH_RADII) {
      ride = await Ride.findById(rideId)
      if (!ride || ride.status === 'accepted') return

      console.log(`🔍 Searching drivers in ${radius}m`)

      const drivers = await Driver.find({
        isOnline: true,
        blocked: false,
        currentLocation: {
          $near: {
            $geometry: { type: 'Point', coordinates: [lng, lat] },
            $maxDistance: radius
          }
        }
      }).limit(10)

      if (!drivers.length) continue

      console.log(`📡 Sending ride to ${drivers.length} drivers`)

      for (let driver of drivers) {
        if (ride.rejectedDrivers.includes(driver._id)) continue

        // 🔐 Driver lock (only if free)
        const locked = await redisApp.set(
          `lock:driver:${driver._id}`,
          rideId,
          'NX',
          'EX',
          ACCEPT_TIMEOUT
        )

        if (!locked) continue

        await Ride.findByIdAndUpdate(rideId, {
          $addToSet: { notifiedDrivers: driver._id }
        })

        const socketId = await redisApp.get(`driver_socket:${driver._id}`)
        if (!socketId) continue

        await redisApp.publish('socket-events', JSON.stringify({
          type: 'ride_request',
          socketId,
          payload: {
            rideId,
            pickupLocation: ride.pickupLocation,
            dropoffLocation: ride.dropoffLocation
          }
        }))

        console.log(`📤 Ride sent to Driver ${driver._id}`)
      }

      // ⏳ Wait instead of CPU loop
      await new Promise(resolve => setTimeout(resolve, ACCEPT_TIMEOUT * 1000))

      ride = await Ride.findById(rideId)
      if (ride?.status === 'accepted') return
    }

    // ❌ Cancel if still requested
    ride = await Ride.findById(rideId)

    if (ride?.status === 'requested') {
      await Ride.findByIdAndUpdate(rideId, {
        status: 'cancelled',
        cancelledBy: 'system',
        cancellationReason: 'No driver accepted'
      })

      if (ride.userSocketId) {
        await redisApp.publish('socket-events', JSON.stringify({
          type: 'ride_cancelled_user',
          socketId: ride.userSocketId,
          payload: { message: 'No driver accepted your ride' }
        }))
      }

      console.log(`❌ Ride ${rideId} cancelled`)
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
    prefix: '{ride-booking}'
  }
)

worker.on('failed', (job, err) => {
  console.error(`❌ Job Failed ${job?.id}:`, err.message)
})
