const Ride = require('../models/ride.model')
const Driver = require('../models/driver.model')
const redis = require('../config/redis')

module.exports = io => {
  global.io = io

  io.on('connection', socket => {
    console.log('🟢 Socket Connected:', socket.id)

    socket.on('driver_online', async ({ driverId, lat, lng }) => {
      try {
        const latitude = Number(lat)
        const longitude = Number(lng)

        if (isNaN(latitude) || isNaN(longitude)) return

        await Driver.findByIdAndUpdate(driverId, {
          isOnline: true,
          socketId: socket.id,
          currentLocation: {
            type: 'Point',
            coordinates: [longitude, latitude]
          }
        })

        await redis.set(`driver_socket:${driverId}`, socket.id)
        await redis.geoadd('geo:drivers', longitude, latitude, driverId)

        console.log(`🚗 Driver Online: ${driverId}`)
      } catch (err) {
        console.error('Driver Online Error:', err.message)
      }
    })

    socket.on('ride_accept', async ({ rideId, driverId }) => {
      try {
        const ride = await Ride.findById(rideId)
        if (!ride) return socket.emit('ride_error', { message: 'Ride not found' })

        if (ride.status === 'accepted') {
          return socket.emit('ride_taken', { message: 'Ride already taken' })
        }

        const lock = await redis.get(`lock:driver:${driverId}`)
        if (lock !== rideId) {
          return socket.emit('ride_error', { message: 'Lock expired' })
        }

        // 🔐 ATOMIC ride lock
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

        ride.driver = driverId
        ride.status = 'accepted'
        await ride.save()

        await redis.del(`lock:driver:${driverId}`)

        io.emit('ride_taken', { rideId, acceptedBy: driverId })

        socket.join(`ride:${rideId}`)

        if (ride.userSocketId) {
          io.to(ride.userSocketId).socketsJoin(`ride:${rideId}`)
          io.to(ride.userSocketId).emit('ride_accepted', ride)
        }

        socket.emit('ride_confirmed', ride)

        console.log(`✅ Ride Accepted: ${rideId}`)
      } catch (err) {
        console.error('Ride Accept Error:', err.message)
      }
    })

    socket.on('ride_reject', async ({ rideId, driverId }) => {
      try {
        await Ride.findByIdAndUpdate(rideId, {
          $addToSet: { rejectedDrivers: driverId }
        })

        await redis.del(`lock:driver:${driverId}`)

        console.log(`❌ Ride Rejected: ${driverId}`)
      } catch (err) {
        console.error('Ride Reject Error:', err.message)
      }
    })

    socket.on('driver_arrived', async ({ rideId }) => {
      const ride = await Ride.findByIdAndUpdate(
        rideId,
        { driverArrivedAt: new Date() },
        { new: true }
      )

      if (ride?.userSocketId) {
        io.to(ride.userSocketId).emit('driver_arrived', ride)
      }
    })

    socket.on('ride_start', async ({ rideId, otp }) => {
      const ride = await Ride.findById(rideId)
      if (!ride) return

      if (ride.startOtp !== otp) {
        return socket.emit('ride_error', { message: 'Invalid OTP' })
      }

      ride.status = 'in_progress'
      ride.actualStartTime = new Date()
      await ride.save()

      io.to(`ride:${rideId}`).emit('ride_started', ride)
    })

    socket.on('ride_complete', async ({ rideId, otp }) => {
      const ride = await Ride.findById(rideId)
      if (!ride) return

      if (ride.stopOtp !== otp) {
        return socket.emit('ride_error', { message: 'Invalid OTP' })
      }

      ride.status = 'completed'
      ride.actualEndTime = new Date()
      await ride.save()

      io.to(`ride:${rideId}`).emit('ride_completed', ride)
    })

    socket.on('ride_cancel', async ({ rideId, cancelledBy, reason }) => {
      const ride = await Ride.findByIdAndUpdate(
        rideId,
        {
          status: 'cancelled',
          cancelledBy,
          cancellationReason: reason
        },
        { new: true }
      )

      if (ride) {
        io.to(`ride:${rideId}`).emit('ride_cancelled', ride)
      }
    })

    socket.on('disconnect', async () => {
      console.log('🔴 Socket Disconnected:', socket.id)

      const driver = await Driver.findOne({ socketId: socket.id })
      if (driver) {
        await redis.del(`driver_socket:${driver._id}`)
      }
    })
  })
}
