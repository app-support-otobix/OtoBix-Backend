const mongoose = require('mongoose');

const userActivityLogsSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: [true, 'User ID is required'],
            trim: true,
            index: true,
        },
        event: {
            type: String,
            required: [true, 'Event name is required'],
            trim: true, // e.g. "login", "app_open", "logout"
            index: true,
        },
        eventDetails: {
            type: String,
            default: '',
            trim: true,
        },
        appName: {
            type: String,
            default: '',
            trim: true,
        },
        appVersion: {
            type: String,
            default: '',
            trim: true,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: () => ({}),
        },
        // Only for saveAppVersionOnAppLaunch api
        lastUpdatedAt: {
            type: Date,
        },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model('UserActivityLogs', userActivityLogsSchema, 'userActivityLogs');
