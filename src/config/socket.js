// src/config/socket.js
const { createAdapter } = require('@socket.io/redis-adapter')
const { createClient } = require('redis')

module.exports = async (io) => {
  try {
    const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1'
    const REDIS_PORT = process.env.REDIS_PORT || 6379
    const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined

    // AWS Redis OSS requires TLS
    const redisUrl = `rediss://${REDIS_HOST}:${REDIS_PORT}`

    const pubClient = createClient({
      url: redisUrl,
      password: REDIS_PASSWORD,
      socket: {
        tls: true,
        rejectUnauthorized: false,
        reconnectStrategy: retries => Math.min(retries * 200, 5000)
      }
    })

    const subClient = pubClient.duplicate()

    // Logging
    pubClient.on('connect', () => console.log('✅ Redis Pub Connected'))
    subClient.on('connect', () => console.log('✅ Redis Sub Connected'))

    pubClient.on('error', err => console.error('❌ Redis Pub Error:', err.message))
    subClient.on('error', err => console.error('❌ Redis Sub Error:', err.message))

    // Connect both
    await pubClient.connect()
    await subClient.connect()

    // Attach Socket.IO Redis Adapter
    io.adapter(createAdapter(pubClient, subClient))

    console.log('🔗 Socket.IO Redis Adapter READY — Multi-Server Sync Active')

  } catch (error) {
    console.error('❌ Socket Redis Adapter Init Failed:', error)
  }
}
