const { Worker } = require('bullmq')
const redis = require('../config/redis')
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
        console.log(`🏁 Ride already accepted — STOP worker`)
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
        console.log(`❌ No drivers in ${radius}m`)
        continue
      }

      console.log(`📡 Sending ride to ${drivers.length} drivers`)

      for (let driver of drivers) {
        if (ride.rejectedDrivers.includes(driver._id)) continue

        await redis.set(`lock:driver:${driver._id}`, rideId, 'EX', ACCEPT_TIMEOUT)

        await Ride.findByIdAndUpdate(rideId, {
          $addToSet: { notifiedDrivers: driver._id }
        })

        global.io.to(driver.socketId).emit('ride_request', {
          rideId,
          pickupLocation: ride.pickupLocation,
          dropoffLocation: ride.dropoffLocation
        })
      }

      console.log(`⏳ Waiting ${ACCEPT_TIMEOUT}s for accept...`)

      const start = Date.now()
      while ((Date.now() - start) / 1000 < ACCEPT_TIMEOUT) {
        ride = await Ride.findById(rideId)

        if (ride?.status === 'accepted') {
          console.log(`🏆 Ride accepted — STOP`)
          return
        }

        await new Promise(resolve => setTimeout(resolve, 500))
      }

      console.log(`🔁 Expanding search radius...`)
    }

    ride = await Ride.findById(rideId)

    if (ride?.status === 'requested') {
      await Ride.findByIdAndUpdate(rideId, {
        status: 'cancelled',
        cancelledBy: 'system',
        cancellationReason: 'No driver accepted'
      })

      console.log(`❌ Ride ${rideId} cancelled`)
    }
  },
  {
    connection: redis,
    concurrency: 5,
    prefix: '{ride-booking}' // REQUIRED
  }
)

worker.on('failed', (job, err) => {
  console.error(`❌ Job Failed ${job?.id}:`, err.message)
})
