
const express = require('express');
const router = express.Router();
// const authMiddleware = require("../Middlewares/auth_middleware");

const { sendOtp, verifyOtp, fetchDetails } = require('../Controllers/otpController');

router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/fetch-details', fetchDetails);

module.exports = router;
