const { Queue } = require('bullmq')
const redis = require('../config/redis')

const rideQueue = new Queue('ride-booking', {
  connection: redis
})

module.exports = rideQueue
