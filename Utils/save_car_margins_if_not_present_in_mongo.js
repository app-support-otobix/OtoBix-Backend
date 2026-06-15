// Utils/save_car_margins_if_not_present_in_mongo.js
const mongoose = require("mongoose");
const CarMarginsModel = require("../Models/carMarginsModel");

async function saveCarMarginsIfNotPresentInMongo() {
    // the default config you want inserted (only once)
    const DEFAULT_DOC = {
        // optional: force a fixed _id (must be valid ObjectId)
        _id: new mongoose.Types.ObjectId("6957a0e8db19712c7981bd09"),

        fixedMargin: 2,
        variableRanges: [
            { min: 0, max: 1, margin: 16 },
            { min: 1, max: 3, margin: 14 },
            { min: 3, max: 5, margin: 12 },
            { min: 5, max: 10, margin: 10 },
            { min: 10, max: 25, margin: 8 },
            { min: 25, max: 999999, margin: 6 },
        ],
    };

    try {
        // If collection doesn't exist OR has no docs => count = 0
        const count = await CarMarginsModel.countDocuments({});
        if (count > 0) {
            console.log("✅ Car Margins already available, skipping adding");
            return;
        }

        await CarMarginsModel.create(DEFAULT_DOC);
        console.log("🆕 Default Car Margins inserted");
    } catch (err) {
        console.error("❌ Error adding Car Margins defaults:", err.message);
    }
}

module.exports = { saveCarMarginsIfNotPresentInMongo };
