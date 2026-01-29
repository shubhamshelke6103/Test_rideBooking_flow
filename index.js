require('dotenv').config()
const express = require('express')
const http = require('http')
const cors = require('cors')
const socketIO = require('socket.io')

const setupSocketAdapter = require('./src/config/socket')
const connectDB = require('./src/config/db')

// Connect MongoDB
connectDB()

const app = express()
app.use(cors())
app.use(express.json())

// Create HTTP Server
const server = http.createServer(app)

// Setup Socket.IO
const io = socketIO(server, {
  cors: { origin: '*' }
})

// Redis Socket Adapter (Multi-server ready)
setupSocketAdapter(io)

// Socket Events
require('./src/sockets/ride.socket')(io)

// Routes
app.use('/api/rides', require('./src/routes/ride.routes'))
app.use('/api/users', require('./src/routes/user.routes'))


// Health check
app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Ride Booking API Running 🚕' })
})

// 🔥 START WORKERS LOCALLY
console.log('🧠 Starting Ride Workers...')
require('./src/workers/ride.worker')
require('./src/workers/timeout.worker')

// Start Server
const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})
