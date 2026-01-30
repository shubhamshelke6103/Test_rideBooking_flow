const { Queue } = require('bullmq')
const redis = require('../config/redis')
console.log("above Ride queue");
const rideQueue = new Queue('ride-booking', {
  connection: redis
})
console.log("after Ride queue");

module.exports = rideQueue
