const Redis = require('ioredis')

const baseConfig = {
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
}

const redis = new Redis(baseConfig)
const redisPub = new Redis(baseConfig)
const redisSub = new Redis(baseConfig)

module.exports = redis
module.exports.redisPub = redisPub
module.exports.redisSub = redisSub
