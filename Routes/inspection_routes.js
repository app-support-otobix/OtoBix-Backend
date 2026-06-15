// routes/inspection_routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { addTelecalling, fetchTelecallingsListByInspectionEngineer, fetchTelecallingsListByTelecaller, updateTelecalling, deleteTelecalling, fetchTelecallingDetails } = require('../Inspection/telecallings_controller');
const { uploadCarImagesToCloudinary, deleteImageFromCloudinary, uploadCarVideoToCloudinary, deleteVideoFromCloudinary, addCarThroughInspection } = require('../Inspection/inspection_cars_controller');
const { fetchAllDropdownsList } = require('../Admin/admin_dropdowns_controller');
const { fetchVehicleDetailsViaAttestr } = require('../Inspection/inspection_controller');

// Use in-memory storage so nothing is saved locally
const multer = require('multer');
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

// TeleCalling Routes
router.post('/telecallings/add', uploadImages.array('carImages', 5), addTelecalling);

// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);


// TeleCalling Routes
router.post('/telecallings/get-list-by-inspection-engineer', fetchTelecallingsListByInspectionEngineer);
router.get('/telecallings/get-list-by-telecaller', fetchTelecallingsListByTelecaller);
router.put('/telecallings/update', updateTelecalling);
router.post('/telecallings/delete', deleteTelecalling);
router.get('/telecallings/get-details', fetchTelecallingDetails);

// Inspection Car Routes
router.post('/car/upload-car-images-to-cloudinary', uploadImages.array('imagesList', 50), uploadCarImagesToCloudinary);
router.delete("/car/delete-image-from-cloudinary", deleteImageFromCloudinary);
router.post("/car/upload-car-video-to-cloudinary", uploadVideo.single("video"), uploadCarVideoToCloudinary, videoMulterErrorHandler);
router.delete("/car/delete-video-from-cloudinary", deleteVideoFromCloudinary);
router.post("/car/add-car-through-inspection", addCarThroughInspection);

// Dropdowns Routes
router.get('/dropdowns/get-all-dropdowns-list', fetchAllDropdownsList);

// Inspection Routes
router.post('/fetch-vehicle-details-via-attestr', fetchVehicleDetailsViaAttestr);

// Export the router
module.exports = router;

