// routes/upcoming_routes.js
const router = require('express').Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { updateCarAuctionTime } = require('../Controllers/upcoming_controller');

// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);

router.post('/update-car-auction-time', updateCarAuctionTime);

module.exports = router;
