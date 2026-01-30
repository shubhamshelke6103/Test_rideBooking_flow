// src/config/socket.js

const { createAdapter } = require('@socket.io/redis-adapter')
const redis = require('./redis')

module.exports = async (io) => {
  try {
    const pubClient = redis.redisPub
    const subClient = redis.redisSub

    pubClient.on('ready', () => {
      console.log('✅ Redis Pub Connected')
    })

    subClient.on('ready', () => {
      console.log('✅ Redis Sub Connected')
    })

    pubClient.on('error', err => {
      console.error('❌ Redis Pub Error:', err.message)
    })

    subClient.on('error', err => {
      console.error('❌ Redis Sub Error:', err.message)
    })

    // Attach Redis adapter (REQUIRED for multi-server sync)
    io.adapter(createAdapter(pubClient, subClient))

    console.log('🔗 Socket.IO Redis Adapter ACTIVE — Multi-EC2 Sync Enabled')

  } catch (error) {
    console.error('❌ Socket Adapter Init Failed:', error)
  }
}
