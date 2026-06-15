// Models/selfInspectedCarMarginsModel.js

const mongoose = require("mongoose");

const selfInspectedCarMarginsSchema = new mongoose.Schema(
    {
        fixedMargin: { type: Number, required: true, default: 2 },

        // exactly your ranges but dynamic
        // each item: { min: 0, max: 1, margin: 16 }
        variableRanges: [
            {
                min: { type: Number, required: true },
                max: { type: Number, required: true },
                margin: { type: Number, required: true },
            },
        ],
    },
    { timestamps: true }
);

module.exports = mongoose.model("SelfInspectedCarMargins", selfInspectedCarMarginsSchema, "selfInspectedCarMargins");
