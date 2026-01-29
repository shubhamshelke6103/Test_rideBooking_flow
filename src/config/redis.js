// src/config/redis.js
const IORedis = require('ioredis')

const redis = new IORedis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,

  // Production stability settings
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000)
    return delay
  },
  reconnectOnError(err) {
    console.error('Redis reconnect due to error:', err.message)
    return true
  },
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
