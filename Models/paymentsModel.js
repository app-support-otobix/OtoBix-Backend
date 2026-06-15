// Models/paymentsModel.js
const mongoose = require('mongoose');

const paymentsSchema = new mongoose.Schema(
    {
        // IDs (as shown on Razorpay)
        paymentId: { type: String, default: "" }, // pay_...
        orderId: { type: String, default: "", index: true }, // order_...
        invoiceId: { type: String, default: "" }, // may be "--"
        bankRrn: { type: String, default: "" }, // may be "--"

        // Payment method details
        paymentMethod: { type: String, default: "" }, // e.g. "netbanking"
        bank: { type: String, default: "" }, // e.g. "IDFC bank" or "IDFC First Bank"
        currency: { type: String, default: "INR" },

        // Customer details
        customerPhone: { type: String, default: "" }, // +91...
        customerEmail: { type: String, default: "" },
        customerUserId: { type: String, default: "" },

        // Fee details (amounts can be decimal)
        totalFee: { type: Number, default: 0 },
        bankFee: { type: Number, default: 0 }, // "IDFC First Bank Limited Fee"
        gst: { type: Number, default: 0 },
        totalAmountPaid: { type: Number, default: 0 },

        // Other info
        feeBearer: { type: String, default: "" }, // e.g. "customer" / message
        appName: { type: String, default: "" },
        appId: { type: String, default: "" },
        description: { type: String, default: "" }, // e.g. Warranty Purchase

        // Notes 
        notes: { type: Map, of: String, default: () => new Map(), },

        // Flags
        lateAuthorized: { type: Boolean, default: false },
        autoCaptured: { type: Boolean, default: false },

        // Helpful extras (recommended)
        status: { type: String, default: "" }, // created/authorized/captured/failed/refunded etc

        // Optional but VERY useful
        rawPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    { timestamps: true }
);

// Optional: prevent duplicate payment records
paymentsSchema.index({ paymentId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Payments', paymentsSchema, 'payments');
