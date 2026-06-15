const mongoose = require("mongoose");

const CounterSchema = new mongoose.Schema(
    {
        _id: { type: String, required: true }, // your key (e.g. "appointmentId_25")
        seq: { type: Number, required: true, default: 0 },
    },
    { timestamps: true, versionKey: false }
);

module.exports =
    mongoose.models.Counter || mongoose.model("Counter", CounterSchema, "counters");
