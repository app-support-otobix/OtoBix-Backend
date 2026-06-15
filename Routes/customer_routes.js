// routes/customer_routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { fetchVehicleRegistrationDetails, searchCarMakes, searchCarModelsByMake, searchCarVariantsByMakeModel, fetchCarBannersList } = require('../Customer/sell_my_car_controller');

const { fetchMyAuctionCarsList } = require('../Customer/view_my_auctions_controller');

const { fetchAuctionDetails, setCustomerExpectedPrice, acceptOffer, setOneClickPrice, submitReAuctionRequest } = require('../Customer/auction_details_controller');

const { fetch10RandomCarsListForBuyACar, saveInterestedBuyer, searchCarsForBuyACar, filterCarsForBuyACar } = require("../Customer/buy_a_car_controller");

const { fetchInspectedCarsListForWarranty, fetchWarrantyOptionsForCar } = require("../Customer/warranty_controller");

const { fetchPdiPrice, searchCarMakesForPdi, searchCarModelsByMakeForPdi, submitPdi, normalizeMakeModel } = require('../Customer/pdi_controller')

const { fetchInsuranceQuotes, getInsuranceRtoList, getInsuranceMakesList, getInsuranceModelsList, getInsuranceVariantsList, getInsuranceVariantsListUsingFuelType, getInsuranceGeneratedQuotesList } = require("../Customer/insurance_controller");


// Use in-memory storage so nothing is saved locally
const multer = require('multer');
const storage = multer.memoryStorage();

// For images upload (max 20MB per image)
const uploadImages = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 } // 20MB per image
});

// Buy A Car Routes
router.get('/buy-a-car/fetch-10-random-cars-from-firestore', fetch10RandomCarsListForBuyACar);
router.post("/buy-a-car/search", searchCarsForBuyACar);
router.post("/buy-a-car/filter", filterCarsForBuyACar);

// Sell My Car Routes
router.post('/sell-my-car/fetch-vehicle-registration-details', fetchVehicleRegistrationDetails);
// router.post('/sell-my-car/search-car-make-model-variant', searchCarMakeModelVariant);
router.post('/sell-my-car/search-car-makes', searchCarMakes);
router.post('/sell-my-car/search-car-models-by-make', searchCarModelsByMake);
router.post('/sell-my-car/search-car-variants-by-make-model', searchCarVariantsByMakeModel);
router.post('/sell-my-car/fetch-car-banners-list', fetchCarBannersList);

// Insurance Routes
router.get('/insurance/get-generated-quotes-list', getInsuranceGeneratedQuotesList);
router.post('/insurance/fetch-quotes', fetchInsuranceQuotes);
router.get('/insurance/get-rto-list', getInsuranceRtoList);
router.get('/insurance/get-makes-list', getInsuranceMakesList);
router.get('/insurance/get-models-list', getInsuranceModelsList);
router.get('/insurance/get-variants-list', getInsuranceVariantsList);
router.get('/insurance/get-variants-list-using-fuel-type', getInsuranceVariantsListUsingFuelType);


// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);

// HomePage Routes


// View My Auction Cars Routes
router.post('/view-my-auctions/fetch-my-auction-cars-list', fetchMyAuctionCarsList);

// Auction Details Routes
router.post('/auction-details/fetch-auction-details', fetchAuctionDetails);
router.put('/auction-details/set-customer-expected-price', setCustomerExpectedPrice);
router.post('/auction-details/accept-offer', acceptOffer);
router.put('/auction-details/set-one-click-price', setOneClickPrice);
router.post('/auction-details/submit-re-auction-request', uploadImages.single("image"), submitReAuctionRequest);

// Buy A Car Routes
router.post('/buy-a-car/save-interested-buyer', saveInterestedBuyer);

// Warranty Routes
router.post('/warranty/fetch-inspected-cars-list-for-warranty', fetchInspectedCarsListForWarranty);
router.get('/warranty/fetch-warranty-options-for-car', fetchWarrantyOptionsForCar);

// PDI Routes
router.get('/pdi/fetch-pdi-price', fetchPdiPrice);
router.post('/pdi/search-make', searchCarMakesForPdi);
router.post('/pdi/search-model-by-make', searchCarModelsByMakeForPdi);
router.post('/pdi/submit-request', submitPdi);
router.post("/pdi/normalize-make-model", normalizeMakeModel);


// Export the router
module.exports = router;
