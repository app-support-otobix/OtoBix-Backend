// models/otobuyOffersModel.js
const mongoose = require('mongoose');
const { FIXED_MARGIN } = require('../Helper Functions/car_margin_helper');
const applyOfferMarginsFromCar = require('../Plugins/otobuy_offers_model_plugin');
const { convertToDoubleForMongo, doubleDefault } = require('../Utils/convert_to_double_for_mongo');
const pluginToUpdateDoubleValue = require('../Plugins/plugin_to_update_double_value');

const otobuyOffersSchema = new mongoose.Schema(
    {
        carId: { type: String, required: true },
        userId: { type: String, required: true },
        kamId: { type: String, default: "" },
        otobuyOffer: { type: Number, default: 0 },
        offerAt: { type: Date, default: Date.now },
        isSystemOffer: { type: Boolean, default: false },
        fixedMargin: { type: convertToDoubleForMongo(), default: doubleDefault(FIXED_MARGIN) }, // in percentages like 4% alaways same 
        variableMargin: { type: convertToDoubleForMongo(), default: doubleDefault(0) }, // in percentages like 16%
    }, { timestamps: true }
);



otobuyOffersSchema.plugin(applyOfferMarginsFromCar, {
    carModelPath: '../Models/carModel',
    carIdField: 'carId',
    alwaysRefreshOnUpdate: false, // set true if you want margins to reset on updating the doc
});

// ✅ Update double values on save
otobuyOffersSchema.plugin(pluginToUpdateDoubleValue, { paths: ['fixedMargin', 'variableMargin'] });



module.exports = mongoose.model('OtobuyOffersModel', otobuyOffersSchema, 'otobuyOffers');