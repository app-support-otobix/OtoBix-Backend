// routes/customer_routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { ewiCallback, ewiSaleApiForGetWarranty, ewiSaleApiForRSA } = require('../Customer/ewi_integration_controller');

// Ewi callback api
router.post('/callback', ewiCallback);

// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);

// Ewi Routes
// router.post('/request', requestEwi);
router.post('/sale-api-for-get-warranty', ewiSaleApiForGetWarranty);
router.post('/sale-api-for-rsa', ewiSaleApiForRSA);

// Export the router
module.exports = router;
