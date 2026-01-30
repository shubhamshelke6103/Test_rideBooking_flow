const IORedis = require('ioredis')

const baseConfig = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  tls: {},
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  connectTimeout: 10000,
  keepAlive: 10000,

  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000)
    console.warn(`🔄 Redis retry #${times} (${delay}ms)`)
    return delay
  }
}

// Normal Redis commands
const redis = new IORedis(baseConfig)

// Publisher (Socket Events / BullMQ Pub)
const redisPub = new IORedis(baseConfig)

// Subscriber (Socket Events)
const redisSub = new IORedis(baseConfig)

// BullMQ dedicated connection
const bullRedis = new IORedis(baseConfig)

redis.on('ready', () => console.log('✅ Redis Ready (Main)'))
redisPub.on('ready', () => console.log('📡 Redis Publisher Ready'))
redisSub.on('ready', () => console.log('📥 Redis Subscriber Ready'))
bullRedis.on('ready', () => console.log('🐂 BullMQ Redis Ready'))

// Export default client (main) and attach helper clients as properties
module.exports = redis
module.exports.redisPub = redisPub
module.exports.redisSub = redisSub
module.exports.bullRedis = bullRedis
