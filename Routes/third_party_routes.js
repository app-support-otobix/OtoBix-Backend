// Routes/third_party_routes.js
const express = require('express');
const router = express.Router();

const thirdPartyAuthMiddleware = require("../Middlewares/third_party_auth_middleware");

const { callbackApiForInsuranceJourney } = require("../Customer/insurance_controller");


// Everything below this line is protected by Third Party token middleware
router.use(thirdPartyAuthMiddleware);


// Insurance Routes
router.post('/insurance-journey-callback', callbackApiForInsuranceJourney);



// Export the router
module.exports = router;
