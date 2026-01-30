const { Worker } = require('bullmq')

// ❌ DO NOT import shared ioredis instance here
// const redis = require('../config/redis')

const redisApp = require('../config/redis') // use only for locks + publish
const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  tls: {} // AWS Redis TLS
}

const Ride = require('../models/ride.model')
const Driver = require('../models/driver.model')

const SEARCH_RADII = [3000, 6000, 9000, 12000]
const ACCEPT_TIMEOUT = 30 // seconds

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

      if (!ride || ride.status === 'accepted') {
        console.log(`🏁 Ride already accepted — STOP`)
        return
      }

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

      if (!drivers.length) {
        console.log(`❌ No drivers found in ${radius}m`)
        continue
      }

      console.log(`📡 Sending ride to ${drivers.length} drivers`)

      for (let driver of drivers) {
        if (ride.rejectedDrivers.includes(driver._id)) continue

        // 🔐 Lock driver
        await redisApp.set(`lock:driver:${driver._id}`, rideId, 'EX', ACCEPT_TIMEOUT)

        await Ride.findByIdAndUpdate(rideId, {
          $addToSet: { notifiedDrivers: driver._id }
        })

        // 🔌 Get driver socket from Redis
        const socketId = await redisApp.get(`driver_socket:${driver._id}`)

        if (!socketId) {
          console.log(`⚠️ Driver ${driver._id} socket missing`)
          continue
        }

        // 📢 Publish event (multi-server safe)
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

      console.log(`⏳ Waiting ${ACCEPT_TIMEOUT}s for accept...`)

      const start = Date.now()
      while ((Date.now() - start) / 1000 < ACCEPT_TIMEOUT) {
        ride = await Ride.findById(rideId)

        if (ride?.status === 'accepted') {
          console.log(`🏆 Ride accepted — STOP worker`)
          return
        }

        await new Promise(resolve => setTimeout(resolve, 500))
      }

      console.log(`🔁 Expanding search radius...`)
    }

    // ❌ Cancel if no acceptance
    ride = await Ride.findById(rideId)

    if (ride?.status === 'requested') {
      await Ride.findByIdAndUpdate(rideId, {
        status: 'cancelled',
        cancelledBy: 'system',
        cancellationReason: 'No driver accepted'
      })

      // 📢 Notify rider via Redis Pub/Sub
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
    connection: redisConnection, // ✅ RAW CONFIG ONLY
    concurrency: 5,
    prefix: '{ride-booking}'
  }
)

worker.on('failed', (job, err) => {
  console.error(`❌ Job Failed ${job?.id}:`, err.message)
})
