const mongoose = require('mongoose');
const CONSTANTS = require('../Utils/constants');

const bannersSchema = new mongoose.Schema(
    {
        imageUrl: {
            type: String,
            required: true,
            trim: true,
        },
        screenName: {
            type: String,
            required: true,
            trim: true,
            default: 'No Screen',
        },
        status: {
            type: String,
            enum: [CONSTANTS.BANNER_STATUS.ACTIVE, CONSTANTS.BANNER_STATUS.INACTIVE],
            default: CONSTANTS.BANNER_STATUS.ACTIVE,
        },
        type: {
            type: String,
            enum: [CONSTANTS.BANNER_TYPES.HEADER, CONSTANTS.BANNER_TYPES.FOOTER],
            required: true,
            default: CONSTANTS.BANNER_TYPES.HEADER,
        },
        view: {
            type: String,
            default: 'Sell My Car',
        },


        // Optional if you want to delete the banner from Cloudinary
        cloudinaryPublicId: {
            type: String,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model('Banners', bannersSchema, 'banners');
