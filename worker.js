require('dotenv').config()
const connectDB = require('./src/config/db')

connectDB()

console.log('🚀 Worker Process Started')

require('./src/workers/ride.worker')
require('./src/workers/timeout.worker')
