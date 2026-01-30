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
          isOnline: true,
          currentLocation: {
            type: 'Point',
            coordinates: [longitude, latitude]
          }
        })

        // ✅ Save socket in Redis (multi-server safe)
        await redis.set(`driver_socket:${driverId}`, socket.id)

        // GEO store
        await redis.geoadd('geo:drivers', longitude, latitude, driverId)

        console.log(`🚗 Driver Online: ${driverId} (${latitude}, ${longitude})`)
      } catch (err) {
        console.error('Driver Online Error:', err.message)
      }
    })

    /**
     * DRIVER ACCEPTS RIDE — FIRST ACCEPT WINS (LOCKED)
     */
    socket.on('ride_accept', async ({ rideId, driverId }) => {
      try {
        const ride = await Ride.findById(rideId)
        if (!ride) return socket.emit('ride_error', { message: 'Ride not found' })

        // Already accepted?
        if (ride.status === 'accepted') {
          return socket.emit('ride_taken', { message: 'Ride already taken' })
        }

        // Redis lock check
        const lock = await redis.get(`lock:driver:${driverId}`)
        if (lock !== rideId) {
          return socket.emit('ride_error', { message: 'Lock expired or invalid' })
        }

        // ✅ Atomically lock ride (first wins)
        const assigned = await redis.set(
          `ride_lock:${rideId}`,
          driverId,
          'NX',
          'EX',
          30
        )

        if (!assigned) {
          return socket.emit('ride_taken', { message: 'Ride already taken' })
        }

        // Assign driver
        ride.driver = driverId
        ride.status = 'accepted'
        await ride.save()

        // 🚫 Remove locks
        await redis.del(`lock:driver:${driverId}`)

        // ✅ Notify ALL drivers ride taken (multi-server safe)
        io.emit('ride_taken', { rideId, acceptedBy: driverId })

        // Join ride room
        socket.join(`ride:${rideId}`)

        // Join user to room
        if (ride.userSocketId) {
          io.to(ride.userSocketId).socketsJoin(`ride:${rideId}`)
          io.to(ride.userSocketId).emit('ride_accepted', ride)
        }

        socket.emit('ride_confirmed', ride)

        console.log(`✅ Ride Accepted: ${rideId} by Driver ${driverId}`)
      } catch (err) {
        console.error('Ride Accept Error:', err.message)
      }
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
     * DRIVER ARRIVED
     */
    socket.on('driver_arrived', async ({ rideId }) => {
      try {
        const ride = await Ride.findByIdAndUpdate(
          rideId,
          { driverArrivedAt: new Date() },
          { new: true }
        )

        if (!ride) return

        if (ride.userSocketId) {
          io.to(ride.userSocketId).emit('driver_arrived', ride)
        }

        console.log(`📍 Driver arrived for Ride ${rideId}`)
      } catch (err) {
        console.error('Driver Arrived Error:', err.message)
      }
    })

    /**
     * START RIDE — OTP
     */
    socket.on('ride_start', async ({ rideId, otp }) => {
      try {
        const ride = await Ride.findById(rideId)
        if (!ride) return socket.emit('ride_error', { message: 'Ride not found' })

        if (ride.startOtp !== otp) {
          return socket.emit('ride_error', { message: 'Invalid OTP' })
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
     * COMPLETE RIDE — OTP
     */
    socket.on('ride_complete', async ({ rideId, otp }) => {
      try {
        const ride = await Ride.findById(rideId)
        if (!ride) return socket.emit('ride_error', { message: 'Ride not found' })

        if (ride.stopOtp !== otp) {
          return socket.emit('ride_error', { message: 'Invalid OTP' })
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
     * CANCEL RIDE
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
     * DISCONNECT — cleanup socket
     */
    socket.on('disconnect', async () => {
      console.log('🔴 Socket Disconnected:', socket.id)

      const driver = await Driver.findOne({ socketId: socket.id })
      if (driver) {
        await redis.del(`driver_socket:${driver._id}`)
      }
    })
  })
}
