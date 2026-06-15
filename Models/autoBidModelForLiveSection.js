// models/AutoBid.js
const mongoose = require('mongoose');
const { FIXED_MARGIN } = require('../Helper Functions/car_margin_helper');
const applyAutoBidMarginsFromCar = require('../Plugins/auto_bid_model_for_live_section_plugin');
const { convertToDoubleForMongo, doubleDefault } = require('../Utils/convert_to_double_for_mongo');
const pluginToUpdateDoubleValue = require('../Plugins/plugin_to_update_double_value');
const CONSTANTS = require('../Utils/constants');

const AutoBidModelForLiveSectionSchema = new mongoose.Schema({
    carId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    kamId: { type: String, default: "" },
    maxAmount: { type: Number, required: true },
    increment: { type: Number, default: 1000 }, // Rs 1000 default
    isActive: { type: Boolean, default: true },
    bidSection: { type: String, default: CONSTANTS.AUCTION_STATUS.LIVE },
    fixedMargin: { type: convertToDoubleForMongo(), default: doubleDefault(FIXED_MARGIN) },
    variableMargin: { type: convertToDoubleForMongo(), default: doubleDefault(0) },
}, { timestamps: true });

AutoBidModelForLiveSectionSchema.index({ carId: 1, userId: 1 }, { unique: true }); // one autobid per (car,user)

// ✅ plugin (create + update)
AutoBidModelForLiveSectionSchema.plugin(applyAutoBidMarginsFromCar, {
    carModelPath: '../Models/carModel',
    carIdField: 'carId',
});

// ✅ Update double values on save
AutoBidModelForLiveSectionSchema.plugin(pluginToUpdateDoubleValue, { paths: ['fixedMargin', 'variableMargin'] });

module.exports = mongoose.model('AutoBidModelForLiveSection', AutoBidModelForLiveSectionSchema, 'autoBidsForLiveSection');
