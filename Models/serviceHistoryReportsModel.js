// models/serviceHistoryReportsModel.js
const mongoose = require('mongoose');

const serviceHistoryReportsSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true, default: '' },
        registrationNumber: { type: String, required: true, default: '' },
        chassisNumber: { type: String, default: '' },
        engineNumber: { type: String, default: '' },
        make: { type: String, default: '' },
        model: { type: String, default: '' },
        bodyType: { type: String, default: '' },
        registrationDate: { type: Date, default: null },
        fuelType: { type: String, default: '' },
        ownerSerialNumber: { type: Number, default: 1 },
        rate: { type: Number, default: 0.0 },
        gst: { type: Number, default: 0.0 },
        total: { type: Number, default: 0.0 },

        status: { type: String, default: 'Pending' },
        licenseNumber: { type: String, default: 'OBT2F2BE6BD204C4F04B' },
        requestId: { type: String, default: '' },
        paymentId: { type: String, default: '' },
        carVaidyaPdfReportUrl: { type: String, default: '' },
        otobixPdfReportUrl: { type: String, default: '' },
        xlsxFileUrl: { type: String, default: '' },
        carVaidyaApiResponse: { type: Object, default: null },

    }, { timestamps: true }
);

module.exports = mongoose.model('ServiceHistoryReports', serviceHistoryReportsSchema, 'serviceHistoryReports');