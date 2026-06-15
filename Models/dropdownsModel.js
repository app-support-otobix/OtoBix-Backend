const mongoose = require('mongoose');


const dropdownsSchema = new mongoose.Schema(
    {
        // Dropdown Name e.g. "Vehicle Condition"
        dropdownName: {
            type: String,
            required: true,
            trim: true,
            unique: true
        },
        // Dropdown Values e.g. ["New", "Used", "Accident"]
        dropdownValues: {
            type: [String],
            default: []
        },
        // Dropdown Status e.g. true
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        versionKey: false, // ✅ removes __v
        timestamps: true,
    }
);

module.exports = mongoose.model("Dropdowns", dropdownsSchema, "dropdowns");
