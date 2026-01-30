const { Queue } = require('bullmq')
const redis = require('../config/redis')

console.log("🚕 Initializing Ride Queue")

const rideQueue = new Queue('ride-booking', {
  connection: redis,
  prefix: '{ride-booking}' // REQUIRED for Redis Cluster
})

console.log("✅ Ride Queue Ready")

module.exports = rideQueue
