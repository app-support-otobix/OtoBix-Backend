// Admin/admin_banners_controller.js
const BannersModel = require('../Models/bannersModel');
const CONSTANTS = require('../Utils/constants');
const cloudinary = require('../Config/cloudinary');
const fs = require('fs');
require('dotenv').config();



// Cloudinary parent folder
const cloudinaryParentFolder = process.env.CLOUDINARY_PARENT_FOLDER;


// Helpers
function getViewFolderName(view) {
    // Map logical “view” name to folder under "Banner Images"
    switch (view) {
        case CONSTANTS.BANNER_VIEWS.SELL_MY_CAR:
            return 'Sell My Car Images';
        case CONSTANTS.BANNER_VIEWS.HOME:
            return 'Home Images';
        default:
            // fallback – keep something readable, no spaces if you prefer
            return `${view} Images`;
    }
}

// Add new banner
exports.addBanner = async (req, res) => {
    try {
        const { screenName, status = CONSTANTS.BANNER_STATUS.ACTIVE, type, view } = req.body;

        if (!screenName || !type || !view) {
            return res.status(400).json({
                success: false,
                message: 'screenName, type and view are required',
            });
        }

        if (![CONSTANTS.BANNER_TYPES.HEADER, CONSTANTS.BANNER_TYPES.FOOTER].includes(type)) {
            return res.status(400).json({
                success: false,
                message: "type must be either 'Header' or 'Footer'",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Image file is required',
            });
        }

        //  Decide Cloudinary folder based on view + type
        const viewFolderName = getViewFolderName(view);
        const folderPath =
            type === CONSTANTS.BANNER_TYPES.HEADER
                ? `${cloudinaryParentFolder}/Banner Images/${viewFolderName}/Header Banners`
                : `${cloudinaryParentFolder}/Banner Images/${viewFolderName}/Footer Banners`;


        // Upload to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(req.file.path, {
            folder: folderPath,
            resource_type: 'image',
        });

        // Create banner document
        const banner = await BannersModel.create({
            imageUrl: uploadResult.secure_url,      // "raw" URL stored here
            screenName,
            status,
            type,
            view,
            cloudinaryPublicId: uploadResult.public_id, // for later deletion
        });

        // ✅ Remove local file after upload
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting temp file:', err);
        });


        res.status(200).json({
            success: true,
            message: 'Banner added successfully',
            data: banner,
        });
    } catch (error) {
        console.error('Error adding banner:', error);
        res.status(500).json({
            success: false,
            message: 'Error adding banner',
            error: error.message,
        });
    }
};


// Fetch banners list according to optional view/type/status
exports.fetchBannersList = async (req, res) => {
    try {
        const { view, type, status } = req.body;

        const filter = {};

        if (view) {
            filter.view = view;
        }

        if (type) {
            filter.type = type;
        }

        if (status) {
            filter.status = status;
        }

        const banners = await BannersModel.find(filter).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: banners,
        });
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching banners',
            error: error.message,
        });
    }
};

// exports.fetchBannersList = async (req, res) => {
//     try {

//         // If you only want Active ones, add { status: 'Active' } too
//         const banners = await BannersModel.find(
//             // { type }
//         ).sort({ createdAt: -1 });

//         res.status(200).json({
//             success: true,
//             data: banners,
//         });
//     } catch (error) {
//         console.error('Error fetching banners:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error fetching banners',
//             error: error.message,
//         });
//     }
// };

// Delete banner
exports.deleteBanner = async (req, res) => {
    try {
        const { bannerId } = req.body;

        const banner = await BannersModel.findById(bannerId);

        if (!banner) {
            return res.status(404).json({
                success: false,
                message: 'Banner not found',
            });
        }

        // Delete image from Cloudinary (if public_id stored)
        if (banner.cloudinaryPublicId) {
            try {
                await cloudinary.uploader.destroy(banner.cloudinaryPublicId);
            } catch (cloudErr) {
                console.error('Error deleting from Cloudinary:', cloudErr);
                // We still proceed to delete from DB
            }
        }

        await banner.deleteOne();

        res.status(200).json({
            success: true,
            message: 'Banner deleted successfully',
        });
    } catch (error) {
        console.error('Error deleting banner:', error);
        res.status(500).json({
            success: false,
            message: 'Error deleting banner',
            error: error.message,
        });
    }
};



// Fetch banners count according to type + view
exports.fetchBannersCount = async (req, res) => {
    try {
        const { type, view } = req.body;

        if (!type) {
            return res.status(400).json({
                success: false,
                message: 'type is required in body',
            });
        }

        if (
            ![CONSTANTS.BANNER_TYPES.HEADER, CONSTANTS.BANNER_TYPES.FOOTER].includes(
                type
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "type must be either 'Header' or 'Footer'",
            });
        }

        const filter = { type };

        if (view) {
            filter.view = view;
        }

        const count = await BannersModel.countDocuments(filter);

        res.status(200).json({
            success: true,
            type,
            view: view || null,
            count,
        });
    } catch (error) {
        console.error('Error fetching banners count:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching banners count',
            error: error.message,
        });
    }
};



// Update / toggle banner status
exports.updateBannerStatus = async (req, res) => {
    try {
        const { bannerId, status } = req.body;

        if (!bannerId || !status) {
            return res.status(400).json({
                success: false,
                message: 'bannerId and status are required',
            });
        }

        if (![CONSTANTS.BANNER_STATUS.ACTIVE, CONSTANTS.BANNER_STATUS.INACTIVE].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "status must be either 'Active' or 'Inactive'",
            });
        }

        const banner = await BannersModel.findByIdAndUpdate(
            bannerId,
            { status },
            { new: true }
        );

        if (!banner) {
            return res.status(404).json({
                success: false,
                message: 'Banner not found',
            });
        }

        res.status(200).json({
            success: true,
            message: 'Banner status updated successfully',
            data: banner,
        });
    } catch (error) {
        console.error('Error updating banner status:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating banner status',
            error: error.message,
        });
    }
};
