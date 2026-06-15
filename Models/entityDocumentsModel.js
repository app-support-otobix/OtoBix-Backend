const mongoose = require('mongoose');

const entitySchema = new mongoose.Schema(
    {
        name: { type: String, unique: true, required: true, trim: true },
        documents: { type: [String], default: [] },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true }
);

module.exports = mongoose.model('EntityDocuments', entitySchema, 'entityDocuments');
