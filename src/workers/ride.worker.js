const { Worker } = require('bullmq')
const redis = require('../config/redis')
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

        await redis.set(`lock:driver:${driver._id}`, rideId, 'EX', ACCEPT_TIMEOUT)

        await Ride.findByIdAndUpdate(rideId, {
          $addToSet: { notifiedDrivers: driver._id }
        })

        const socketId = await redis.get(`driver_socket:${driver._id}`)

        if (!socketId) {
          console.log(`⚠️ Driver ${driver._id} socket missing`)
          continue
        }

        // ✅ Publish event instead of socket emit
        await redis.publish('socket-events', JSON.stringify({
          type: 'ride_request',
          socketId,
          payload: {
            rideId,
            pickupLocation: ride.pickupLocation,
            dropoffLocation: ride.dropoffLocation
          }
        }))

        console.log(`📤 Ride published for Driver ${driver._id}`)
      }

      console.log(`⏳ Waiting ${ACCEPT_TIMEOUT}s...`)

      const start = Date.now()
      while ((Date.now() - start) / 1000 < ACCEPT_TIMEOUT) {
        ride = await Ride.findById(rideId)
        if (ride?.status === 'accepted') return
        await new Promise(r => setTimeout(r, 500))
      }
    }

    ride = await Ride.findById(rideId)

    if (ride?.status === 'requested') {
      await Ride.findByIdAndUpdate(rideId, {
        status: 'cancelled',
        cancelledBy: 'system',
        cancellationReason: 'No driver accepted'
      })

      await redis.publish('socket-events', JSON.stringify({
        type: 'ride_cancelled_user',
        socketId: ride.userSocketId,
        payload: { message: 'No driver accepted your ride' }
      }))

      console.log(`❌ Ride cancelled`)
    }
  },
  {
    connection: redis,
    concurrency: 5,
    prefix: '{ride-booking}'
  }
)
