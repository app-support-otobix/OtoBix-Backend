// models/SoldCar.js
const mongoose = require('mongoose');
const { FIXED_MARGIN } = require('../Helper Functions/car_margin_helper');
const applySoldCarMarginsFromCar = require('../Plugins/sold_cars_model_plugin');
const { convertToDoubleForMongo, doubleDefault } = require('../Utils/convert_to_double_for_mongo');
const pluginToUpdateDoubleValue = require('../Plugins/plugin_to_update_double_value');

const soldCarsSchema = new mongoose.Schema(
    {
        carId: { type: String, required: true, unique: true },
        oneClickPrice: { type: Number, default: 0 },
        highestBid: { type: Number, default: 0 },
        soldAt: { type: Number, default: 0 },
        boughtAt: { type: Date, default: Date.now },
        userId: { type: String, required: true },
        soldTo: { type: String, required: true, default: '' },
        soldBy: { type: String, required: true, default: '' },
        fixedMargin: { type: convertToDoubleForMongo(), default: doubleDefault(FIXED_MARGIN) }, // in percentages like 4% alaways same 
        variableMargin: { type: convertToDoubleForMongo(), default: doubleDefault(0) }, // in percentages like 16%

    }, { timestamps: true }
);



soldCarsSchema.plugin(applySoldCarMarginsFromCar, {
    carModelPath: '../Models/carModel',
    carIdField: 'carId',
    alwaysRefreshOnUpdate: true, // set true if you want margins to reset on updating the doc
});

// ✅ Update double values on save
soldCarsSchema.plugin(pluginToUpdateDoubleValue, { paths: ['fixedMargin', 'variableMargin'] });



module.exports = mongoose.model('SoldCarsModel', soldCarsSchema, 'soldCars');