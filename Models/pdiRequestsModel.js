const mongoose = require("mongoose");

const PdiRequestsSchema = new mongoose.Schema(
  {
    // payment + user
    paymentId: { type: String, required: true, trim: true },
    pdiType: { type: String, required: true, trim: true }, // "New Car PDI" / "Used Car PDI"
    userId: { type: String, required: true, trim: true },
    userPhoneNumber: { type: String, required: true, trim: true },

    // car details
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    fuelType: { type: String, required: true, trim: true },
    transmissionType: { type: String, required: true, trim: true },

    // booking
    inspectionDate: { type: Date, required: true }, // store as Date (ISO string comes from app)
    customerType: { type: String, required: true, enum: ["Consumer", "Business"] },

    // address
    billingAddress: { type: String, required: true, trim: true },
    visitAddress: { type: String, required: true, trim: true },
    pinCode: { type: String, required: true, trim: true }, // India pincode as string

    // pricing
    rate: { type: Number, required: true },
    gst: { type: Number, required: true },
    total: { type: Number, required: true },

    // used-car optional fields
    registrationNumber: { type: String, trim: true, default: "" },
    isServiceHistoryProvided: { type: Boolean, default: false },

    // status (optional but helpful)
    status: {   type: String,  default: "Pending",  },

    // To store what happened if api fails
    responseBody: { type: Object, default: null },
    httpStatus: { type: Number, default: null },
  },
  { timestamps: true }
);


module.exports = mongoose.model("PdiRequests", PdiRequestsSchema, "pdiRequests");