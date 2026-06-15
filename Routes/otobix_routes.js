// Routes/otobix_routes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');

const otobixAuthMiddleware = require("../Middlewares/otobix_auth_middleware");

const { saveInterestedBuyer } = require("../Customer/buy_a_car_controller");
// const { fetchVehicleRegistrationDetails } = require('../Customer/sell_my_car_controller');
const { fetchVehicleDetailsViaAttestr } = require('../Inspection/inspection_controller');
const { addTelecalling } = require('../Inspection/telecallings_controller');
const { searchCarMakes, searchCarModelsByMake, searchCarVariantsByMakeModel } = require('../Customer/sell_my_car_controller');
const { uploadCarImagesToCloudinary, deleteImageFromCloudinary, uploadCarVideoToCloudinary, deleteVideoFromCloudinary } = require('../Inspection/inspection_cars_controller');
const { updateCarAuctionTime } = require('../Controllers/upcoming_controller');
const { moveCarToOtobuy, markCarAsSold } = require('../Controllers/otobuy_controller');
const { removeCar, rejectACar } = require("../Controllers/car_details_controller");
const { setCarVariableMargin } = require('../Admin/admin_cars_controller');
const { setCustomerExpectedPrice } = require('../Customer/auction_details_controller');
const { deleteSingleBid, deleteAllBids } = require('../Admin/admin_bids_controller');
const { makeSelfInspectedCarLive, uploadSelfInspectedCarImage, deleteSelfInspectedCarImage } = require('../Controllers/self_inspection_controller');
const { fixCarFields } = require('../Controllers/temp_apis_controller');


// Use in-memory storage so nothing is saved locally
const storage = multer.memoryStorage();
// For images upload (max 20MB per image)
const uploadImages = multer({
    storage,
    limits: {
        fileSize: 20 * 1024 * 1024, // 20MB per image
    },
});

// For video upload (max 200MB per video)
const uploadVideo = multer({
    storage,
    limits: { fileSize: 200 * 1024 * 1024 }, // 200MB per video
});

// For video upload error handling
const videoMulterErrorHandler = (err, req, res, next) => {
    if (err && err.name === "MulterError") {
        return res.status(400).json({
            success: false,
            message:
                err.code === "LIMIT_UNEXPECTED_FILE"
                    ? 'Only one video is allowed (field name must be "video").'
                    : err.message,
            code: err.code,
        });
    }
    next(err);
};


// Everything below this line is protected by Otobix token middleware
router.use(otobixAuthMiddleware);

// Buy A Car Routes
router.post('/buy-a-car/save-interested-buyer', saveInterestedBuyer);

// Sell My Car Routes
// router.post('/sell-my-car/fetch-vehicle-registration-details', fetchVehicleRegistrationDetails);
router.post('/fetch-vehicle-details-via-attestr', fetchVehicleDetailsViaAttestr);
router.post('/telecallings/add', uploadImages.array('carImages', 5), addTelecalling);
router.post('/search-car-makes', searchCarMakes);
router.post('/search-car-models-by-make', searchCarModelsByMake);
router.post('/search-car-variants-by-make-model', searchCarVariantsByMakeModel);

// Routes only for new CRM
router.post('/car/upload-car-images-to-cloudinary', uploadImages.array('imagesList', 50), uploadCarImagesToCloudinary);
router.delete("/car/delete-image-from-cloudinary", deleteImageFromCloudinary);
router.post("/car/upload-car-video-to-cloudinary", uploadVideo.single("video"), uploadCarVideoToCloudinary, videoMulterErrorHandler);
router.delete("/car/delete-video-from-cloudinary", deleteVideoFromCloudinary);
router.post('/schedule-auction', updateCarAuctionTime);
router.post('/move-car-to-otobuy', moveCarToOtobuy);
router.post('/mark-car-as-sold', markCarAsSold);
router.post('/remove-car', removeCar);
router.post('/set-variable-margin', setCarVariableMargin);
router.put('/set-customer-expected-price', setCustomerExpectedPrice);
router.delete('/delete-single-bid', deleteSingleBid);
router.delete('/delete-all-bids', deleteAllBids);
router.post('/make-self-inspected-car-live', makeSelfInspectedCarLive);
router.post('/reject-a-car', rejectACar);
router.post('/upload-self-inspected-car-image', uploadImages.single("image"), uploadSelfInspectedCarImage);
router.delete("/delete-self-inspected-car-image", deleteSelfInspectedCarImage);


// Temp Routes
router.post('/fix-car-fields', fixCarFields);


// Export the router
module.exports = router;
