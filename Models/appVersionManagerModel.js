
// Models/appVersionManagerModel.js
const mongoose = require("mongoose");

// schema for maintaining app version
const platformConfigSchema = new mongoose.Schema(
    {
        packageName: { type: String, required: true }, // e.g. com.otobix.auctionapp
        latestVersion: { type: String, required: true }, // e.g. "1.2.3"
        minSupportedVersion: { type: String, required: true }, // e.g. "1.1.0"
        storeUrl: { type: String, default: "" },
        releaseNotes: { type: String, default: "" },
    },
    { _id: false }
);

// Actual schema for app version manager
const appVersionManagerSchema = new mongoose.Schema(
    {
        // your app identifier used by admin panel + api + flutter
        appKey: {
            type: String,
            required: true,
            unique: true,
            enum: ["customer", "dealer", "inspection"], // add more if needed
        },

        android: { type: platformConfigSchema, required: true },
        ios: { type: platformConfigSchema, required: true },

        // optional global toggles
        enabled: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model(
    "AppVersionManager",
    appVersionManagerSchema,
    "appVersionManager"
);
