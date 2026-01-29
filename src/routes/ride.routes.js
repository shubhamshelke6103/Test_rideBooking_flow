const express = require('express')
const router = express.Router()

const rideController = require('../controllers/ride.controller')

router.post('/request', rideController.requestRide)

module.exports = router
