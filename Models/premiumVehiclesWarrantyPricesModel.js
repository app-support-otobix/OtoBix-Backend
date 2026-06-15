const mongoose = require('mongoose');

const premiumVehiclesWarrantyPricesSchema = new mongoose.Schema(
    {
    make: { type: String, trim: true, default: "" },
    model: { type: String, trim: true, default: ""},

    // Pricing columns
    '6MonthsComprehensive': { type: Number, default: 0},
    '6MonthsEngineTransmission': { type: Number, default: 0 },
    '12MonthsComprehensive': { type: Number, default: 0 },
    '12MonthsEngineTransmission': { type: Number, default: 0 },
    },
    {
        timestamps: true,
    }
);


// unique per make+model
premiumVehiclesWarrantyPricesSchema.index({ make: 1, model: 1 }, { unique: true });

module.exports = mongoose.model('PremiumVehiclesWarrantyPrices', premiumVehiclesWarrantyPricesSchema, 'premiumVehiclesWarrantyPrices');
