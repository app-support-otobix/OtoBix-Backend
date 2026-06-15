
// Models/ewiIntegrationModel.js
const mongoose = require("mongoose");

const ewiIntegrationSchema = new mongoose.Schema(
    {
        appointmentId: { type: String, default: '', trim: true },
        inspectionId: { type: String, default: '', trim: true },
        registrationNumber: { type: String, default: '', trim: true },
        message: { type: String, default: '', trim: true },
        warrantyCover: { type: String, default: '', trim: true },
        warrantyPeriod: { type: String, default: '', trim: true },
        programeType: { type: String, default: '', trim: true },
        status: { type: String, default: '', trim: true },
        engineerName: { type: String, default: '', trim: true },
        apiType: { type: String, default: '', trim: true },
        requestBody: { type: Object, default: {} },
    },
    { timestamps: true }
);

module.exports = mongoose.model(
    "EwiIntegration",
    ewiIntegrationSchema,
    "ewiIntegration"
);
