const { Worker } = require('bullmq')
const redis = require('../config/redis')
const Ride = require('../models/ride.model')
const Driver = require('../models/driver.model')

const SEARCH_RADII = [3000, 6000, 9000, 12000]
const ACCEPT_TIMEOUT = 30 // seconds

const worker = new Worker('ride-booking', async job => {
  const { rideId } = job.data

  console.log(`🚕 Processing Ride Job: ${rideId}`)

  let ride = await Ride.findById(rideId)
  if (!ride || ride.status !== 'requested') return

  const [lng, lat] = ride.pickupLocation.coordinates

  for (let radius of SEARCH_RADII) {

    // 🔁 Always reload ride status
    ride = await Ride.findById(rideId)
    if (!ride || ride.status === 'accepted') {
      console.log(`🏁 Ride already accepted — STOP worker`)
      return
    }

    console.log(`🔍 Searching drivers in radius: ${radius}m`)

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

    console.log(`📡 Broadcasting ride to ${drivers.length} drivers`)

    // 📡 Send to all drivers
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

    console.log(`⏳ Waiting ${ACCEPT_TIMEOUT}s for first accept...`)

    // ⏱ Wait loop
    const start = Date.now()
    while ((Date.now() - start) / 1000 < ACCEPT_TIMEOUT) {

      ride = await Ride.findById(rideId)

      if (ride?.status === 'accepted') {
        console.log(`🏆 Ride accepted — STOPPING WORKER`)
        return
      }

      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log(`🔁 No accept in ${radius}m — expanding search`)
  }

  // ❌ Cancel only if STILL requested
  ride = await Ride.findById(rideId)

  if (ride?.status === 'requested') {
    await Ride.findByIdAndUpdate(rideId, {
      status: 'cancelled',
      cancelledBy: 'system',
      cancellationReason: 'No driver accepted'
    })

    console.log(`❌ Ride ${rideId} cancelled — no driver accepted`)
  }
}, {
  connection: redis,
  concurrency: 5
})

worker.on('failed', (job, err) => {
  console.log(`🔁 Job Failed: ${job.id} — ${err.message}`)
})
