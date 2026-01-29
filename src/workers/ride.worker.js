const { Worker } = require('bullmq')
const redis = require('../config/redis')
const Ride = require('../models/ride.model')
const Driver = require('../models/driver.model')

const SEARCH_RADII = [3000, 6000, 9000, 12000] // meters
const ACCEPT_TIMEOUT = 60 // seconds

const worker = new Worker('ride-booking', async job => {
  const { rideId } = job.data

  console.log(`🚕 Processing Ride Job: ${rideId}`)

  const ride = await Ride.findById(rideId)
  if (!ride || ride.status !== 'requested') return

  const [lng, lat] = ride.pickupLocation.coordinates

  for (let radius of SEARCH_RADII) {
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
    }).limit(5)

    if (!drivers.length) {
      console.log(`❌ No drivers found in ${radius}m`)
      continue
    }

    for (let driver of drivers) {
      if (ride.rejectedDrivers.includes(driver._id)) continue

      // Set lock for this driver for this ride
      const lock = await redis.set(
        `lock:driver:${driver._id}`,
        rideId,
        'NX',
        'EX',
        ACCEPT_TIMEOUT
      )

      if (!lock) continue

      console.log(`📩 Sending ride to driver ${driver._id}`)

      await Ride.findByIdAndUpdate(rideId, {
        $addToSet: { notifiedDrivers: driver._id }
      })

      // Emit to driver socket
      global.io.to(driver.socketId).emit('ride_request', {
        rideId,
        pickupLocation: ride.pickupLocation,
        dropoffLocation: ride.dropoffLocation
      })

      // Wait 30 seconds for accept
      const accepted = await waitForAccept(rideId, driver._id)

      if (accepted) {
        console.log(`✅ Driver accepted ride: ${driver._id}`)
        return
      }

      console.log(`❌ Driver did not accept: ${driver._id}`)
    }
  }

  // Cancel ride if nobody accepted
  await Ride.findByIdAndUpdate(rideId, {
    status: 'cancelled',
    cancelledBy: 'system',
    cancellationReason: 'No driver available'
  })

  console.log(`❌ Ride ${rideId} cancelled — no driver available`)
}, {
  connection: redis,
  concurrency: 5
})

/**
 * WAIT FOR DRIVER ACCEPT
 */
async function waitForAccept(rideId, driverId) {
  const start = Date.now()

  while ((Date.now() - start) / 1000 < ACCEPT_TIMEOUT) {
    const ride = await Ride.findById(rideId)

    if (ride?.status === 'accepted' && ride.driver?.toString() === driverId.toString()) {
      return true
    }

    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  await redis.del(`lock:driver:${driverId}`)
  return false
}

worker.on('failed', (job, err) => {
  console.log(`🔁 Job Failed: ${job.id} — ${err.message}`)
})
