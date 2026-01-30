require('dotenv').config()
const express = require('express')
const http = require('http')
const cors = require('cors')
const socketIO = require('socket.io')

const setupSocketAdapter = require('./src/config/socket')
const connectDB = require('./src/config/db')
const redis = require('./src/config/redis') // ✅ ADD THIS

connectDB()

const app = express()
app.use(cors())
app.use(express.json())

const server = http.createServer(app)

const io = socketIO(server, {
  cors: { origin: '*' }
})

setupSocketAdapter(io)
require('./src/sockets/ride.socket')(io)

// ✅ Redis Pub/Sub Listener for Worker → Socket Events
redis.subscribe('socket-events')

redis.on('message', (channel, message) => {
  try {
    const data = JSON.parse(message)

    // 🚗 Send ride to driver
    if (data.type === 'ride_request') {
      io.to(data.socketId).emit('ride_request', data.payload)
    }

    // ❌ Ride cancelled to user
    if (data.type === 'ride_cancelled_user') {
      io.to(data.socketId).emit('ride_cancelled', data.payload)
    }

    // ✅ Ride accepted broadcast
    if (data.type === 'ride_taken') {
      io.emit('ride_taken', data.payload)
    }

  } catch (err) {
    console.error('Redis socket event error:', err.message)
  }
})

app.use('/api/rides', require('./src/routes/ride.routes'))
app.use('/api/users', require('./src/routes/user.routes'))

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Ride Booking API Running 🚕' })
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`)
})
