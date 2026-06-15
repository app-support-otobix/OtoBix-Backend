const express = require("express");
const router = express.Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const {
    getCarDetails,
    updateCarDetails,
    getCarList,
    updateBid,
    updateAuctionTime,
    checkHighestBidder,
    submitAutoBidForLiveSection,
    addCar,
    removeCar,
    getCarsListModelForACar,
    getCarAuctionStatusAndRemainingTime } = require("../Controllers/car_details_controller");
// const { getCarList } = require("../Controllers/car_details_controller");

// Public Routes
router.post('/add-car', addCar);

// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);

router.get("/details/:id", getCarDetails);
router.put("/update", updateCarDetails);
router.get("/cars-list", getCarList);
router.post('/update-bid', updateBid);
router.post('/update-auction-time', updateAuctionTime);
router.post('/check-highest-bidder', checkHighestBidder);
router.post('/submit-auto-bid-for-live-section', submitAutoBidForLiveSection);
router.post('/remove-car', removeCar);
router.post('/get-cars-list-model-for-a-car', getCarsListModelForACar);
router.post('/get-car-auction-status-and-remaining-time', getCarAuctionStatusAndRemainingTime);


module.exports = router;