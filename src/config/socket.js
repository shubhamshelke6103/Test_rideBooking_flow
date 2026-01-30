// src/config/socket.js
const { createAdapter } = require('@socket.io/redis-adapter')
const redisClients = require('./redis')

module.exports = async (io) => {
  try {
    const pubClient = redisClients.redisPub
    const subClient = redisClients.redisSub

    // Attach logging
    pubClient.on('ready', () => console.log('✅ Redis Pub Ready (ioredis)'))
    subClient.on('ready', () => console.log('✅ Redis Sub Ready (ioredis)'))

    pubClient.on('error', err => console.error('❌ Redis Pub Error:', err.message))
    subClient.on('error', err => console.error('❌ Redis Sub Error:', err.message))

    // Attach Socket.IO Redis Adapter using ioredis clients
    io.adapter(createAdapter(pubClient, subClient))

    console.log('🔗 Socket.IO Redis Adapter READY — Multi-Server Sync Active')

  } catch (error) {
    console.error('❌ Socket Redis Adapter Init Failed:', error)
  }
}
