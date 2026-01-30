const { Queue } = require('bullmq')

const redisConnection = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
}

console.log("🚕 Initializing Ride Queue")

const rideQueue = new Queue('ride-booking', {
  connection: redisConnection,
  prefix: '{ride-booking}'
})

console.log("✅ Ride Queue Ready")

module.exports = rideQueue
