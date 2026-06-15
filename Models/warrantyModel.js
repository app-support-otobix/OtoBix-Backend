
// Models/warrantyModel.js
const mongoose = require("mongoose");

const warrantySchema = new mongoose.Schema(
    {

        // Common Fields In Both
        carImageUrl: { type: String, default: '', trim: true },
        appointmentId: { type: String, default: '', trim: true },
        warrantyPrice: { type: Number, default: 0 },
        warrantyPriceAfterMarkup: { type: Number, default: 0 },
        warrantyPriceAfterGst: { type: Number, default: 0 },
        markupPercentage: { type: Number, default: 0 },
        gstPercentage: { type: Number, default: 0 },
        paymentId: { type: String, default: '', trim: true },
        apiHitThrough: { type: String, default: '', trim: true },
        userId: { type: String, default: '', trim: true },
        carId: { type: String, default: '', trim: true },
        thirdPartyResponse: { type: Object, default: {} },

        // Api Req Body Fields
        userName: { type: String, default: 'Otobix', trim: true },
        name: { type: String, default: '', trim: true },
        address: { type: String, default: '', trim: true },
        mobile: { type: String, default: '', trim: true },
        email: { type: String, default: '', trim: true },
        vehicleRegDate: { type: String, default: '', trim: true },
        dealerName: { type: String, default: 'Otobix', trim: true },
        areaOffice: { type: String, default: '', trim: true },
        chassisNo: { type: String, default: '', trim: true },
        engineNo: { type: String, default: '', trim: true },
        make: { type: String, default: '', trim: true },
        model: { type: String, default: '', trim: true },
        warrantyCover: { type: String, default: '', trim: true },
        warrantyPeriod: { type: String, default: '', trim: true },
        vehicleCc: { type: String, default: '', trim: true },
        regNo: { type: String, default: '', trim: true },
        odometer: { type: String, default: '', trim: true },

        // RSA Specific Fields
        policyHolderName: { type: String, default: '', trim: true },
        fullBillingAddress: { type: String, default: '', trim: true },
        warrantySaleDate: { type: String, default: '', trim: true },


    },
    { timestamps: true }
);

module.exports = mongoose.model(
    "Warranty",
    warrantySchema,
    "warranty"
);
