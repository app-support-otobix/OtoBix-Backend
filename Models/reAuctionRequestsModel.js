
// Model/reAuctionRequestsModel.js
const mongoose = require("mongoose");


const reAuctionRequestsSchema = new mongoose.Schema(
    {
        carId: { type: String, required: true, trim: true, unique: true },
        appointmentId: { type: String, required: true, trim: true, unique: true, index: true },
        odometerReading: { type: Number, default: null },
        odometerProofImageUrl: { type: String, trim: true, default: "" },
        ownerName: { type: String, required: true, trim: true },
        make: { type: String, required: true, trim: true },
        model: { type: String, required: true, trim: true },
        variant: { type: String, required: true, trim: true },
        customerContactNumber: { type: String, trim: true, default: "" },
    },
    {
        timestamps: true,
        strict: true, // prevents saving unknown fields
    }
);

module.exports = mongoose.model("ReAuctionRequests", reAuctionRequestsSchema, "reAuctionRequests");


