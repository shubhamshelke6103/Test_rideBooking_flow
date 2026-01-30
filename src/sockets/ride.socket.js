const Ride = require('../models/ride.model')
const Driver = require('../models/driver.model')
const redis = require('../config/redis')

module.exports = io => {
  global.io = io

  io.on('connection', socket => {
    console.log('🟢 Socket Connected:', socket.id)

    /**
     * DRIVER ONLINE — Save socket + GEO location
     */
    socket.on('driver_online', async ({ driverId, lat, lng }) => {
      try {
        const latitude = Number(lat)
        const longitude = Number(lng)

        if (isNaN(latitude) || isNaN(longitude)) {
          console.error('❌ Invalid coordinates received')
          return
        }

        await Driver.findByIdAndUpdate(driverId, {
          socketId: socket.id,
          isOnline: true,
          currentLocation: {
            type: 'Point',
            coordinates: [longitude, latitude]
          }
        })

        // Store in Redis GEO
        await redis.geoadd('geo:drivers', longitude, latitude, driverId)

        console.log(`🚗 Driver Online: ${driverId} (${latitude}, ${longitude})`)
      } catch (err) {
        console.error('Driver Online Error:', err.message)
      }
    })

    /***********************
     * DRIVER ACCEPTS RIDE — FIRST ACCEPT WINS
     ***********************/
    socket.on('ride_accept', async ({ rideId, driverId }) => {
      try {
        // Fetch ride
        const ride = await Ride.findById(rideId)

        if (!ride) {
          return socket.emit('ride_error', { message: 'Ride not found' })
        }

        // ❌ If already accepted by someone else
        if (ride.status === 'accepted') {
          return socket.emit('ride_taken', {
            message: 'Ride already accepted by another driver'
          })
        }

        // Check Redis lock
        const lock = await redis.get(`lock:driver:${driverId}`)
        if (lock !== rideId) {
          return socket.emit('ride_error', {
            message: 'Lock expired or invalid'
          })
        }

        // ✅ Assign driver FIRST COME FIRST SERVE
        ride.driver = driverId
        ride.status = 'accepted'
        await ride.save()

        // ❌ Remove all other driver locks
        await redis.del(`ride:locks:${rideId}`)

        // 🚫 Notify ALL other drivers that ride is taken
        global.io.emit('ride_taken', {
          rideId,
          acceptedBy: driverId
        })

        // 👥 Join ride room
        socket.join(`ride:${rideId}`)

        if (ride.userSocketId) {
          const userSocket = io.sockets.sockets.get(ride.userSocketId)
          userSocket?.join(`ride:${rideId}`)
        }

        // 📲 Notify rider
        io.to(ride.userSocketId).emit('ride_accepted', ride)

        // 🚗 Confirm driver
        socket.emit('ride_confirmed', ride)

        console.log(`✅ Ride Accepted: ${rideId} by Driver ${driverId}`)
      } catch (err) {
        console.error('Ride Accept Error:', err.message)
      }
    })

    /***********************
     * OTHER DRIVERS STOP SEEING RIDE
     ***********************/
    socket.on('ride_taken', ({ rideId, acceptedBy }) => {
      console.log(`🚫 Ride ${rideId} taken by ${acceptedBy}`)
    })

    /**
     * DRIVER REJECTS RIDE
     */
    socket.on('ride_reject', async ({ rideId, driverId }) => {
      try {
        await Ride.findByIdAndUpdate(rideId, {
          $addToSet: { rejectedDrivers: driverId }
        })

        await redis.del(`lock:driver:${driverId}`)

        console.log(`❌ Driver ${driverId} rejected Ride ${rideId}`)
      } catch (err) {
        console.error('Ride Reject Error:', err.message)
      }
    })

    /**
     * DRIVER ARRIVED — Notify Rider
     */
    socket.on('driver_arrived', async ({ rideId }) => {
      try {
        const ride = await Ride.findByIdAndUpdate(
          rideId,
          { driverArrivedAt: new Date() },
          { new: true }
        )

        if (!ride) return console.log('❌ Ride not found')

        if (ride.userSocketId) {
          io.to(ride.userSocketId).emit('driver_arrived', ride)
        }

        console.log(`📍 Driver arrived for Ride ${rideId}`)
      } catch (err) {
        console.error('Driver Arrived Error:', err.message)
      }
    })

    /**
     * START RIDE — OTP VALIDATION
     */
    socket.on('ride_start', async ({ rideId, otp }) => {
      try {
        const ride = await Ride.findById(rideId)

        if (!ride)
          return socket.emit('ride_error', { message: 'Ride not found' })

        if (ride.startOtp !== otp) {
          return socket.emit('ride_error', { message: 'Invalid Start OTP' })
        }

        ride.status = 'in_progress'
        ride.actualStartTime = new Date()
        await ride.save()

        io.to(`ride:${rideId}`).emit('ride_started', ride)

        console.log(`▶ Ride Started: ${rideId}`)
      } catch (err) {
        console.error('Ride Start Error:', err.message)
      }
    })

    /**
     * COMPLETE RIDE — OTP VALIDATION
     */
    socket.on('ride_complete', async ({ rideId, otp }) => {
      try {
        const ride = await Ride.findById(rideId)

        if (!ride)
          return socket.emit('ride_error', { message: 'Ride not found' })

        if (ride.stopOtp !== otp) {
          return socket.emit('ride_error', { message: 'Invalid Stop OTP' })
        }

        ride.status = 'completed'
        ride.actualEndTime = new Date()
        await ride.save()

        io.to(`ride:${rideId}`).emit('ride_completed', ride)

        console.log(`🏁 Ride Completed: ${rideId}`)
      } catch (err) {
        console.error('Ride Complete Error:', err.message)
      }
    })

    /**
     * RIDE CANCEL — USER OR DRIVER
     */
    socket.on('ride_cancel', async ({ rideId, cancelledBy, reason }) => {
      try {
        const ride = await Ride.findByIdAndUpdate(
          rideId,
          {
            status: 'cancelled',
            cancelledBy,
            cancellationReason: reason
          },
          { new: true }
        )

        if (!ride) return

        io.to(`ride:${rideId}`).emit('ride_cancelled', ride)

        console.log(`🚫 Ride Cancelled: ${rideId}`)
      } catch (err) {
        console.error('Ride Cancel Error:', err.message)
      }
    })

    /**
     * SOCKET DISCONNECT
     */
    socket.on('disconnect', () => {
      console.log('🔴 Socket Disconnected:', socket.id)
    })
  })
}
