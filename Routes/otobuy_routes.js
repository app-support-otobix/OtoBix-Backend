// routes/otobuy_routes.js
const router = require('express').Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { moveCarToOtobuy, buyCar, makeOffer, markCarAsSold } = require('../Controllers/otobuy_controller');


// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);

router.post('/move-car-to-otobuy', moveCarToOtobuy);
router.post('/buy-car', buyCar);
router.post('/make-offer-for-car', makeOffer);
router.post('/mark-car-as-sold', markCarAsSold);

module.exports = router;
