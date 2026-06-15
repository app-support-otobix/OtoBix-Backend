const mongoose = require('mongoose');
const applyMarginsOnSelfInspectedCarOffer = require('../Plugins/apply_margins_on_self_inspected_car_offer_plugin');
const { convertToDoubleForMongo, doubleDefault } = require('../Utils/convert_to_double_for_mongo');
const pluginToUpdateDoubleValue = require('../Plugins/plugin_to_update_double_value');


const selfInspectedCarOffersSchema = new mongoose.Schema({
    carId: {
        type: String,
        required: true
    },
    userId: {
        type: String,
        required: true
    },
    offerAmount: {
        type: Number,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    isSystemOffer: {
        type: Boolean,
        default: false
    },
    fixedMargin: { type: convertToDoubleForMongo(), default: doubleDefault(0) }, // in percentages like 2% alaways same 
    variableMargin: { type: convertToDoubleForMongo(), default: doubleDefault(0) }, // in percentages like 8%

}, { timestamps: true });


// Set margins on add bids etc
selfInspectedCarOffersSchema.plugin(applyMarginsOnSelfInspectedCarOffer, {
    selfInspectedCarsModelPath: '../Models/selfInspectedCarsModel',
    carIdField: 'carId',
});

// ✅ Update double values on save
selfInspectedCarOffersSchema.plugin(pluginToUpdateDoubleValue, { paths: ['fixedMargin', 'variableMargin'] });



module.exports = mongoose.model('SelfInspectedCarOffers', selfInspectedCarOffersSchema, 'selfInspectedCarOffers');
