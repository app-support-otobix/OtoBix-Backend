
// Models/insuranceJourneyModel.js
const mongoose = require('mongoose');
const auditUpdateLogsPlugin = require("../Plugins/audit_update_logs_plugin");

const insuranceJourneySchema = new mongoose.Schema({
    
    otobixPartnerReferenceId: {
        type: String,
        trim: true,
        default: ''
    },

    pbPartnerReferenceId: {
        type: String,
        trim: true,
        default: ''
    },

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

    insurerName: {
      type: String,
      trim: true,
      default: '',
    },

    policyType: {
      type: String,
      trim: true,
      default: '',
    },

    idv: {
      type: Number,
      default: 0.0,
    },

    premiumAmount: {
      type: Number,
      default: 0.0,
    },

    customerName: {
      type: String,
      trim: true,
      default: '',
    },

    mobileNumber: {
      type: String,
      trim: true,
      default: '',
    },

    emailId: {
      type: String,
      trim: true,
      default: '',
    },

    policyNumber: {
      type: String,
      trim: true,
      default: '',
    },

    policyCopy: {
      type: String,
      trim: true,
      default: '',
    },

    statusTimestamp: {
      type: String,
      trim: true,
      default: '',
    },

    remarks: {
      type: String,
      trim: true,
      default: '',
    },

    status: {
        type: String,
        trim: true,
        default: "Pending",
    },

    // optional: save what we gave in response
    callbackResponse: {
      type: Map,
      default: {},
    },
   
}, { timestamps: true });


// Auto-add logs field if not already present
insuranceJourneySchema.plugin(auditUpdateLogsPlugin, {
    logsPath: "logs",
    ignore: ["__v", "createdAt", "updatedAt"],
    metaOptionKey: "audit",
});


module.exports = mongoose.model('InsuranceJourney', insuranceJourneySchema, 'insuranceJourney');
