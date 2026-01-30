const { Queue } = require('bullmq')
const { bullRedis } = require('../config/redis')

console.log("🚕 Initializing Ride Queue")

const rideQueue = new Queue('ride-booking', {
  connection: bullRedis,
  prefix: '{ride-booking}' // REQUIRED for Redis Cluster
})

console.log("✅ Ride Queue Ready")

module.exports = rideQueue
