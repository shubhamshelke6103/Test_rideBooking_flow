require('dotenv').config()
const express = require('express')
const http = require('http')
const cors = require('cors')
const socketIO = require('socket.io')

const setupSocketAdapter = require('./src/config/socket')
const connectDB = require('./src/config/db')

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

app.use('/api/rides', require('./src/routes/ride.routes'))
app.use('/api/users', require('./src/routes/user.routes'))

app.get('/', (req, res) => {
  res.json({ status: 'OK', message: 'Ride Booking API Running 🚕' })
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => {
  console.log(`🚀 API Server running on port ${PORT}`)
})
