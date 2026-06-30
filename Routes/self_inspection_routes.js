// routes/self_inspection_routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { submitSelfInspectionRequest, getUserSelfInspectedCarsList, getSelfInspectedCarById, getLiveSelfInspectedCarsList,
    makeOfferOnSelfInspectedCar, getPriceOfferedSelfInspectedCarsList, setSelfInspectedCarExpectedPrice,
    acceptSelfInspectedCarOffer } = require('../Controllers/self_inspection_controller');
const { fetchTelecallingsListByDealerAsSeller } = require('../Inspection/telecallings_controller');

// Use in-memory storage so nothing is saved locally
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB per image
});


// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);


// Self Inspection Routes
router.post('/submit-self-inspection-request',
    upload.fields([
        { name: 'frontMainImage', maxCount: 1 },
        { name: 'rhsFullImage', maxCount: 1 },
        { name: 'rearMainImage', maxCount: 1 },
        { name: 'bootFloorImage', maxCount: 1 },
        { name: 'lhsMainImage', maxCount: 1 },
        { name: 'engineBayImage', maxCount: 1 },
        { name: 'dashboardImage', maxCount: 1 },
        { name: 'additionalImages', maxCount: 5 }
    ]),
    submitSelfInspectionRequest
);
router.get('/get-user-self-inspected-cars-list', getUserSelfInspectedCarsList);
router.get('/get-self-inspected-car-by-id', getSelfInspectedCarById);
router.get('/get-live-self-inspected-cars-list', getLiveSelfInspectedCarsList);
router.post('/make-offer-on-self-inspected-car', makeOfferOnSelfInspectedCar);
router.get('/get-price-offered-self-inspected-cars-list', getPriceOfferedSelfInspectedCarsList);
router.post('/set-self-inspected-car-expected-price', setSelfInspectedCarExpectedPrice);
router.post('/accept-self-inspected-car-offer', acceptSelfInspectedCarOffer);

// Telecallings Routes
router.get('/fetch-telecallings-list-by-dealer-as-seller', fetchTelecallingsListByDealerAsSeller);





// Export the router
module.exports = router;