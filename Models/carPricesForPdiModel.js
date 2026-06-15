const mongoose = require("mongoose");

const ChargesSchema = new mongoose.Schema(
  {
    rate: { type: Number, required: true },
    gst: { type: Number, required: true },
    total: { type: Number, required: true },
    rounding: { type: Number, required: true },
  },
  { _id: false }
);

const CarPricesForPdiSchema = new mongoose.Schema(
  {
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },

    vehicleInspection: { type: ChargesSchema, required: true },
    serviceHistory: { type: ChargesSchema, required: true },
  },
  { timestamps: true }
);


module.exports = mongoose.model("CarPricesForPdi", CarPricesForPdiSchema, "carPricesForPdi");