// models/notification.model.js
const mongoose = require('mongoose');

const userNotificationsSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    type: { type: String, default: 'info' },          // e.g. 'info', 'bid_outbid', 'system'
    title: { type: String, required: true },
    body: { type: String, required: true },           // short/long text shown in detail
    data: { type: Object, default: {} },              // optional payload (carId, etc.)
    isRead: { type: Boolean, default: false, index: true },
    createdAt: { type: Date, default: Date.now, index: true },
    // NEW FIELDS
    isGlobal: { type: Boolean, default: false, index: true }, // <- one doc for all users
}, { timestamps: true });

userNotificationsSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('UserNotifications', userNotificationsSchema, 'userNotifications');
