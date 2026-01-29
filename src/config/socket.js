// src/config/socket.js
const { createAdapter } = require('@socket.io/redis-adapter')
const { createClient } = require('redis')

module.exports = async (io) => {
  try {
    const redisUrl = process.env.REDIS_URL || 
      `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${process.env.REDIS_PORT || 6379}`

    const pubClient = createClient({
      url: redisUrl,
      password: process.env.REDIS_PASSWORD || undefined,
      socket: {
        reconnectStrategy: retries => Math.min(retries * 100, 3000)
      }
    })

    const subClient = pubClient.duplicate()

    // Connect Redis Clients
    await pubClient.connect()
    await subClient.connect()

    // Attach adapter
    io.adapter(createAdapter(pubClient, subClient))

    console.log('🔗 Socket.IO Redis Adapter Connected (Multi-Server Ready)')
  } catch (error) {
    console.error('❌ Socket Redis Adapter Error:', error.message)
  }
}
