const Ride = require('../models/ride.model')
const Driver = require('../models/driver.model')
const redis = require('../config/redis')

module.exports = io => {
  global.io = io

  io.on('connection', socket => {
    console.log('🟢 Socket Connected:', socket.id)

    // DRIVER ONLINE
    socket.on('driver_online', async ({ driverId, lat, lng }) => {
      console.log('📡 driver_online event received:', { driverId, lat, lng })

      try {
        const latitude = Number(lat)
        const longitude = Number(lng)

        if (isNaN(latitude) || isNaN(longitude)) {
          console.log('❌ Invalid coordinates:', { lat, lng })
          return
        }

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

        console.log(`🚗 Driver Online Saved: ${driverId}`)
      } catch (err) {
        console.error('❌ Driver Online Error:', err.message)
      }
    })

    // DRIVER ACCEPT RIDE
    socket.on('ride_accept', async ({ rideId, driverId }) => {
      console.log('📡 ride_accept event received:', { rideId, driverId })

      try {
        const ride = await Ride.findById(rideId)
        if (!ride) {
          console.log('❌ Ride not found:', rideId)
          return socket.emit('ride_error', { message: 'Ride not found' })
        }

        if (ride.status === 'accepted') {
          console.log('⚠️ Ride already accepted:', rideId)
          return socket.emit('ride_taken', { message: 'Ride already taken' })
        }

        const lock = await redis.get(`lock:driver:${driverId}`)
        console.log('🔐 Driver Lock Check:', lock)

        if (lock !== rideId) {
          console.log('❌ Lock expired or invalid')
          return socket.emit('ride_error', { message: 'Lock expired' })
        }

        const assigned = await redis.set(
          `ride_lock:${rideId}`,
          driverId,
          'NX',
          'EX',
          30
        )

        console.log('🔒 Ride Lock Assigned:', assigned)

        if (!assigned) {
          console.log('⚠️ Ride lock failed — already taken')
          return socket.emit('ride_taken', { message: 'Ride already taken' })
        }

        ride.driver = driverId
        ride.status = 'accepted'
        await ride.save()

        await redis.del(`lock:driver:${driverId}`)

        console.log(`✅ Ride Accepted: ${rideId} by ${driverId}`)

        io.emit('ride_taken', { rideId, acceptedBy: driverId })

        socket.join(`ride:${rideId}`)

        if (ride.userSocketId) {
          io.to(ride.userSocketId).socketsJoin(`ride:${rideId}`)
          io.to(ride.userSocketId).emit('ride_accepted', ride)
          console.log('📩 Notified User Socket:', ride.userSocketId)
        }

        socket.emit('ride_confirmed', ride)
      } catch (err) {
        console.error('❌ Ride Accept Error:', err.message)
      }
    })

    // DRIVER REJECT RIDE
    socket.on('ride_reject', async ({ rideId, driverId }) => {
      console.log('📡 ride_reject event received:', { rideId, driverId })

      try {
        await Ride.findByIdAndUpdate(rideId, {
          $addToSet: { rejectedDrivers: driverId }
        })

        await redis.del(`lock:driver:${driverId}`)

        console.log(`❌ Ride Rejected by Driver: ${driverId}`)
      } catch (err) {
        console.error('❌ Ride Reject Error:', err.message)
      }
    })

    // DRIVER ARRIVED
    socket.on('driver_arrived', async ({ rideId }) => {
      console.log('📡 driver_arrived event received:', { rideId })

      try {
        const ride = await Ride.findByIdAndUpdate(
          rideId,
          { driverArrivedAt: new Date() },
          { new: true }
        )

        if (ride?.userSocketId) {
          io.to(ride.userSocketId).emit('driver_arrived', ride)
          console.log(`📍 Driver Arrived Event Sent to User`)
        }
      } catch (err) {
        console.error('❌ Driver Arrived Error:', err.message)
      }
    })

    // START RIDE
    socket.on('ride_start', async ({ rideId, otp }) => {
      console.log('📡 ride_start event received:', { rideId, otp })

      try {
        const ride = await Ride.findById(rideId)
        if (!ride) return

        if (ride.startOtp !== otp) {
          console.log('❌ Invalid Start OTP')
          return socket.emit('ride_error', { message: 'Invalid OTP' })
        }

        ride.status = 'in_progress'
        ride.actualStartTime = new Date()
        await ride.save()

        console.log(`▶ Ride Started: ${rideId}`)

        io.to(`ride:${rideId}`).emit('ride_started', ride)
      } catch (err) {
        console.error('❌ Ride Start Error:', err.message)
      }
    })

    // COMPLETE RIDE
    socket.on('ride_complete', async ({ rideId, otp }) => {
      console.log('📡 ride_complete event received:', { rideId, otp })

      try {
        const ride = await Ride.findById(rideId)
        if (!ride) return

        if (ride.stopOtp !== otp) {
          console.log('❌ Invalid Stop OTP')
          return socket.emit('ride_error', { message: 'Invalid OTP' })
        }

        ride.status = 'completed'
        ride.actualEndTime = new Date()
        await ride.save()

        console.log(`🏁 Ride Completed: ${rideId}`)

        io.to(`ride:${rideId}`).emit('ride_completed', ride)
      } catch (err) {
        console.error('❌ Ride Complete Error:', err.message)
      }
    })

    // CANCEL RIDE
    socket.on('ride_cancel', async ({ rideId, cancelledBy, reason }) => {
      console.log('📡 ride_cancel event received:', { rideId, cancelledBy, reason })

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

        if (ride) {
          console.log(`🚫 Ride Cancelled: ${rideId}`)
          io.to(`ride:${rideId}`).emit('ride_cancelled', ride)
        }
      } catch (err) {
        console.error('❌ Ride Cancel Error:', err.message)
      }
    })

    // DISCONNECT
    socket.on('disconnect', async () => {
      console.log('🔴 Socket Disconnected:', socket.id)

      try {
        const driver = await Driver.findOne({ socketId: socket.id })
        if (driver) {
          await redis.del(`driver_socket:${driver._id}`)
          console.log(`🧹 Cleaned Redis Socket for Driver: ${driver._id}`)
        }
      } catch (err) {
        console.error('❌ Disconnect Cleanup Error:', err.message)
      }
    })
  })
}
