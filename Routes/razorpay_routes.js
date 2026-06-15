// Routes/razorpay_routes.js
const router = require('express').Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { createOrder, verifyPayment } = require('../Controllers/razorpay_controller');


// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);


router.post("/create-order", createOrder);
router.post("/verify-payment", verifyPayment);

module.exports = router;
