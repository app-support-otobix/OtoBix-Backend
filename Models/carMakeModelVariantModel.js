// Models/carMakeModelVariantModel.js
const mongoose = require('mongoose');

const carMakeModelVariantSchema = new mongoose.Schema(
    {
        fullName: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },
        make: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },
        model: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },
        variant: {
            type: String,
            required: true,
            index: true,
            trim: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
    }
);

// Optional: prevent exact duplicates (same make + model + variant)
carMakeModelVariantSchema.index(
    { make: 1, model: 1, variant: 1 },
    { unique: true }
);

const CarMakeModelVariant = mongoose.model(
    'CarMakeModelVariant',
    carMakeModelVariantSchema,
    'carMakeModelVariant'
);

module.exports = CarMakeModelVariant;
