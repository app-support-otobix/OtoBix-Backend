// inspection_cars_controller.js

const CarModel = require('../Models/carModel');
const CONSTANTS = require('../Utils/constants');
require('dotenv').config();
const {
    makeStableFileId,
    assertIsImageFile,
    compressImage,
    uploadImageWithCheck,
    generateSignedUrl,
    CLOUDINARY_DELIVERY_TYPE,
    deleteImageFromCloudinaryByPublicId,
} = require('../Helper Functions/inspection_add_car_image_helpers');
const {
    makeStableFileIdForVideoUpload,
    assertIsVideoFileForVideoUpload,
    uploadVideoWithCheckForVideoUpload,
    buildOptimizedVideoUrlForVideoUpload,
    CLOUDINARY_DELIVERY_TYPE_FOR_VIDEO_UPLOAD,
    deleteVideoFromCloudinaryByPublicId,
} = require('../Helper Functions/inspection_add_car_video_helpers');


// ======================= Upload car images to cloudinary and return their urls  =======================
exports.uploadCarImagesToCloudinary = async (req, res) => {
    try {
        const appointmentId = (req.body.appointmentId || "").trim();

        // ✅ appointmentId validation
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "Car Appointment ID is required",
                cloudinaryUrls: [],
            });
        }

        // ✅ files validation
        const files = req.files;
        if (!files || !Array.isArray(files) || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Images List is required (send as multipart field "imagesList")',
                cloudinaryUrls: [],
            });
        }

        // Base folder unchanged (as you requested)
        const baseFolder = `${process.env.CLOUDINARY_PARENT_FOLDER}/Car Images/${appointmentId}`;

        // ✅ Validate ALL are images (fail-fast with clear error)
        for (const file of files) {
            await assertIsImageFile(file);
        }

        // Optional: dedupe within the same request (if user attaches same file twice)
        const seen = new Set();

        const uploaded = [];
        for (const file of files) {
            const fileId = makeStableFileId(file.buffer);

            if (seen.has(fileId)) continue;
            seen.add(fileId);

            const compressedBuffer = await compressImage(file.buffer);
            const result = await uploadImageWithCheck(compressedBuffer, baseFolder, fileId);

            // If images are sensitive, do NOT rely on returned secure_url when using authenticated/private
            const signedUrl =
                (CLOUDINARY_DELIVERY_TYPE === "authenticated")
                    ? generateSignedUrl(result.publicId)
                    : null;

            uploaded.push({
                publicId: result.publicId,
                url: result.url,           // for type=upload this is publicly viewable
                signedUrl,                 // for type=authenticated you can use this to view
                alreadyExisted: result.alreadyExisted,
            });
        }

        return res.status(200).json({
            success: true,
            message: "Images processed successfully",
            count: uploaded.length,
            cloudinaryUrls: uploaded.map((x) => x.url), // if you want just URLs list
            files: uploaded,                            // richer response
            deliveryType: CLOUDINARY_DELIVERY_TYPE,
        });
    } catch (err) {
        console.log("Error while uploading car images to cloudinary", err);
        return res.status(400).json({
            success: false,
            message: "Upload failed",
            cloudinaryUrls: [],
        });
    }
};


// ======================= Delete Image From Cloudinary =======================
exports.deleteImageFromCloudinary = async (req, res) => {
    const publicId = req.body.publicId;
    if (!publicId) {
        return res.status(400).json({
            success: false,
            message: "Public ID is required",
        });
    }
    try {
        const out = await deleteImageFromCloudinaryByPublicId(publicId);

        if (out.result === "not found") {
            return res.status(404).json({
                success: false,
                message: "Image not found on Cloudinary",
                ...out,
            });
        }
        return res.status(200).json({
            success: true,
            message: "Image deleted successfully",
        });
    } catch (error) {
        console.log("Error while deleting image from cloudinary", error);
        return res.status(400).json({
            success: false,
            message: "Delete failed",
        });
    }
};



// ======================= Upload car video to cloudinary and return its url  =======================
exports.uploadCarVideoToCloudinary = async (req, res) => {
    try {
        const appointmentId = (req.body.appointmentId || "").trim();
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "Car Appointment ID is required",
            });
        }

        const file = req.file; // single file
        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'Video is required (send as multipart field "video")',
            });
        }

        await assertIsVideoFileForVideoUpload(file);

        const baseFolder = `${process.env.CLOUDINARY_PARENT_FOLDER}/Car Videos/${appointmentId}`;

        const fileId = makeStableFileIdForVideoUpload(file.buffer);
        const uploaded = await uploadVideoWithCheckForVideoUpload(file.buffer, baseFolder, fileId);

        // Optimized delivery URL (safe point). :contentReference[oaicite:4]{index=4}
        const optimizedUrl = buildOptimizedVideoUrlForVideoUpload(uploaded.publicId);

        return res.status(200).json({
            success: true,
            message: "Video processed successfully",
            deliveryType: CLOUDINARY_DELIVERY_TYPE_FOR_VIDEO_UPLOAD,
            publicId: uploaded.publicId,
            originalUrl: uploaded.url,
            optimizedUrl,
            alreadyExisted: uploaded.alreadyExisted,
        });
    } catch (err) {
        console.log("Error while uploading car video to cloudinary", err);
        return res.status(400).json({
            success: false,
            message: "Upload failed",
        });
    }
};



// ======================= Delete Video From Cloudinary =======================
exports.deleteVideoFromCloudinary = async (req, res) => {
    const publicId = req.body.publicId;
    if (!publicId) {
        return res.status(400).json({
            success: false,
            message: "Public ID is required",
        });
    }
    try {
        const out = await deleteVideoFromCloudinaryByPublicId(publicId);

        if (out.result === "not found") {
            return res.status(404).json({
                success: false,
                message: "Video not found on Cloudinary",
                ...out,
            });
        }
        return res.status(200).json({
            success: true,
            message: "Video deleted successfully",
        });
    } catch (error) {
        console.log("Error while deleting video from cloudinary", error);
        return res.status(400).json({
            success: false,
            message: "Delete failed",
        });
    }
};





// ======================= Add Car Through Inspection =======================
exports.addCarThroughInspection = async (req, res) => {
    try {
        // Destructure only necessary fields from request body
        const { appointmentId } = req.body;

        // Validation for required fields
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: 'Appointment ID is required.',
            });
        }

        // ✅ Force auctionStatus to be empty string "" always for this API
        const payload = {
            ...req.body,
            auctionStatus: "",
        };

        // Add the car to the database with other fields automatically included from req.body
        const car = await CarModel.create(payload);

        // Respond with the newly created car
        res.status(200).json({
            success: true,
            data: car,
        });
    } catch (error) {
        console.error('Error adding car:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding car',
            error: error.message,
        });
    }
};
