const mongoose = require('mongoose');
const CONSTANTS = require('../Utils/constants');
const { DEFAULT_CONFIG } = require('../Helper Functions/car_margin_helper');
const applyBidMarginsFromCar = require('../Plugins/bid_model_plugin');
const { convertToDoubleForMongo, doubleDefault } = require('../Utils/convert_to_double_for_mongo');
const pluginToUpdateDoubleValue = require('../Plugins/plugin_to_update_double_value');


const bidSchema = new mongoose.Schema({
    carId: {
        type: String,
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    kamId: {
        type: String,
        default: ""
    },
    bidAmount: {
        type: Number,
        required: true
    },
    time: {
        type: Date,
        default: Date.now
    },
    isActive: {
        type: Boolean,
        default: true
    },
    bidSection: {
        type: String,
        default: CONSTANTS.AUCTION_STATUS.LIVE
    },
    isSystemBid: {
        type: Boolean,
        default: false
    },
    fixedMargin: { type: convertToDoubleForMongo(), default: doubleDefault(DEFAULT_CONFIG.fixedMargin) }, // in percentages like 2% alaways same 
    variableMargin: { type: convertToDoubleForMongo(), default: doubleDefault(0) }, // in percentages like 16%

}, { timestamps: true });


// Set margins on add bids etc
bidSchema.plugin(applyBidMarginsFromCar, {
    carModelPath: '../Models/carModel',
    carIdField: 'carId',
});

// ✅ Update double values on save
bidSchema.plugin(pluginToUpdateDoubleValue, { paths: ['fixedMargin', 'variableMargin'] });



module.exports = mongoose.model('BidModel', bidSchema, 'bids');
