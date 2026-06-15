
// Models/insuranceQuotesModel.js
const mongoose = require('mongoose');

const insuranceQuotesSchema = new mongoose.Schema({
    
    userId: {
        type: String,
        trim: true,
        default: ''
    },
    registrationNumber: {
        type: String,
        trim: true,
        default: ''
    },
    policyType: {
        type: String,
        trim: true,
        default: ''
    },
    otobixMessage: {
        type: String,
        trim: true,
        default: ''
    },
    otobixPartnerReferenceId: {
        type: String,
        trim: true,
        default: ''
    },
    status: {
        type: String,
        trim: true,
        default: 'Pending'
    },
    pbMessage: {
        type: String,
        trim: true,
        default: ''
    },
    pbResponseCode: {
        type: String,
        trim: true,
        default: ''
    },
    pbPartnerReferenceId: {
        type: String,
        trim: true,
        default: ''
    },
    redirectLink: {
        type: String,
        trim: true,
        default: ''
    },
    quotes: {
        type: [],
        default: []
    },
    pbResponse: {
        type: Map,
        default: {}
    },
    carType: {
        type: String,
        trim: true,
        default: ''
    },

    // New car quotes fields
    makeId: {
        type: Number,
        trim: true,
        default: 0
    },
    makeName: {
        type: String,
        trim: true,
        default: ''
    },
    modelId: {
        type: Number,
        trim: true,
        default: 0
    },
    modelName: {
        type: String,
        trim: true,
        default: ''
    },
    variantId: {
        type: Number,
        trim: true,
        default: 0
    },
    variantName: {
        type: String,
        trim: true,
        default: ''
    },
    fuelTypeId: {
        type: Number,
        trim: true,
        default: 0
    },
    fuelType: {
        type: String,
        trim: true,
        default: ''
    },
    registeredCityId: {
        type: Number,
        trim: true,
        default: 0
    },
    regionCode: {
        type: String,
        trim: true,
        default: ''
    },
    stateName: {
        type: String,
        trim: true,
        default: ''
    },
    cityName: {
        type: String,
        trim: true,
        default: ''
    },
    manufacturingDate: {
        type: Date,
        trim: true,
        default: null
    },
    vehicleOwnedBy: {
        type: Number,
        trim: true,
        default: 0
    }, // 1 for Individual 2 for Corporate
   
}, { timestamps: true });


module.exports = mongoose.model('InsuranceQuotes', insuranceQuotesSchema, 'insuranceQuotes');
