// src/config/redis.js
const IORedis = require('ioredis')

const redis = new IORedis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,

  // AWS Redis OSS requires TLS
  tls: {},

  // Prevent BullMQ freezing
  maxRetriesPerRequest: null,
  enableReadyCheck: true,

  // Connection stability
  connectTimeout: 10000,
  keepAlive: 10000,

  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000)
    console.warn(`🔄 Redis retry attempt #${times}, delay ${delay}ms`)
    return delay
  },

  reconnectOnError(err) {
    console.error('❌ Redis reconnect due to error:', err.message)
    return true
  }
})

// Connected log
redis.on('connect', () => {
  console.log('✅ Redis Connected')
})

// Ready log
redis.on('ready', () => {
  console.log('⚡ Redis Ready to use')
})

// Error handling
redis.on('error', (err) => {
  console.error('❌ Redis Error:', err.message)
})

// Reconnecting log
redis.on('reconnecting', (delay) => {
  console.warn(`🔄 Redis reconnecting in ${delay}ms`)
})

// Close log
redis.on('close', () => {
  console.warn('🔌 Redis connection closed')
})

module.exports = redis
