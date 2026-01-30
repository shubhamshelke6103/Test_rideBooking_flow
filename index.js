require('dotenv').config()

const express = require('express')
const http = require('http')
const cors = require('cors')
const socketIO = require('socket.io')

// DB & Redis
const connectDB = require('./src/config/db')
const redis = require('./src/config/redis')

// Socket Setup
const setupSocketAdapter = require('./src/config/socket')

// Workers
const rideWorker = require('./src/workers/ride.worker')
const timeoutWorker = require('./src/workers/timeout.worker')

// Connect DB
connectDB()

const app = express()
app.use(cors())
app.use(express.json())

const server = http.createServer(app)

const io = socketIO(server, {
  cors: { origin: '*' }
})

// Attach Redis Socket Adapter
setupSocketAdapter(io)

// Load Socket Handlers
require('./src/sockets/ride.socket')(io)


// ✅ Redis Subscriber (Worker → Socket Events)
const redisSub = redis.redisSub

redisSub.subscribe('socket-events')

redisSub.on('message', (channel, message) => {
  try {
    const data = JSON.parse(message)

    // 🚗 Send ride request to driver
    if (data.type === 'ride_request') {
      io.to(data.socketId).emit('ride_request', data.payload)
    }

    // ❌ Ride cancelled to user
    if (data.type === 'ride_cancelled_user') {
      io.to(data.socketId).emit('ride_cancelled', data.payload)
    }

    // ✅ Ride taken broadcast to all drivers
    if (data.type === 'ride_taken') {
      io.emit('ride_taken', data.payload)
    }

  } catch (err) {
    console.error('❌ Redis socket event error:', err.message)
  }
})


// Routes
app.use('/api/rides', require('./src/routes/ride.routes'))
app.use('/api/users', require('./src/routes/user.routes'))

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Ride Booking API Running 🚕' })
})


// Start Server
const PORT = process.env.PORT || 5000

server.listen(PORT, () => {
  console.log(`🚀 API + Workers running on port ${PORT}`)
})
