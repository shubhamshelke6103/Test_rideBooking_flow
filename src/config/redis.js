const IORedis = require('ioredis')

const redis = new IORedis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,

  // AWS Redis requires TLS
  tls: {},

  // BullMQ safe config
  maxRetriesPerRequest: null,
  enableReadyCheck: false,

  connectTimeout: 10000,
  keepAlive: 10000,

  retryStrategy(times) {
    const delay = Math.min(times * 200, 3000)
    console.warn(`🔄 Redis retry #${times}, delay ${delay}ms`)
    return delay
  },

  reconnectOnError(err) {
    console.error('❌ Redis reconnect due to error:', err.message)
    return true
  }
})

// Logs
redis.on('connect', () => {
  console.log('✅ Redis Connected')
})

redis.on('ready', () => {
  console.log('⚡ Redis Ready')
})

redis.on('error', (err) => {
  console.error('❌ Redis Error:', err.message)
})

redis.on('close', () => {
  console.warn('🔌 Redis Connection Closed')
})

module.exports = redis
