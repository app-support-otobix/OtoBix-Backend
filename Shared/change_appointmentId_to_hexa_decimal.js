// change_appointmentId_to_hexa_decimal.js
const crypto = require("crypto");
const { Types } = require("mongoose");

// Decide your normalization rules once and never change them
function normalizeAppointmentId(id) {
    return id.trim().toLowerCase(); // or .replace(/-/g, '') if you want
}

function getObjectIdFromAppointmentId(apptId) {
    const norm = normalizeAppointmentId(apptId);
    const hash = crypto.createHash("sha1").update(norm, "utf8").digest(); // 20 bytes
    const buf12 = hash.subarray(0, 12); // take first 12 bytes
    return new Types.ObjectId(buf12);
}

module.exports = { getObjectIdFromAppointmentId, normalizeAppointmentId };
