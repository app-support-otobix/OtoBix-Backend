// Helper Functions/external_id_extraction_helpers.js

const UserModel = require('../Models/userModel');
const CONSTANTS = require('../Utils/constants');

function normalizePhone(v) {
    if (!v) return null;
    // keeps digits only, strips spaces, dashes, +, etc.
    return String(v).replace(/[^\d]/g, '');
}

// Get Customer id by phone number
async function getCustomerIdByPhoneNumber(phoneNumber) {
    const normalized = normalizePhone(phoneNumber);
    if (!normalized) return null;

    // Try exact match (if DB already stores normalized)
    let user = await UserModel.findOne({ phoneNumber: normalized, userRole: CONSTANTS.USER_ROLES.CUSTOMER, }).select('_id').lean();

    // If your DB stores phone with "+" or formatting, try a looser match:
    if (!user) {
        user = await UserModel.findOne({
            userRole: CONSTANTS.USER_ROLES.CUSTOMER,
            phoneNumber: { $regex: `${normalized}$` },
        }).select('_id').lean();
    }


    return user?._id?.toString() || null;
}



// Get Inspection engineer id by phone number
async function getInspectionEngineerIdByPhoneNumber(phoneNumber) {
    const normalized = normalizePhone(phoneNumber);
    if (!normalized) return null;

    // Try exact match (if DB already stores normalized)
    let user = await UserModel.findOne({ phoneNumber: normalized, userRole: CONSTANTS.USER_ROLES.INSPECTION_ENGINEER, }).select('_id').lean();

    // If your DB stores phone with "+" or formatting, try a looser match:
    if (!user) {
        user = await UserModel.findOne({
            userRole: CONSTANTS.USER_ROLES.INSPECTION_ENGINEER,
            phoneNumber: { $regex: `${normalized}$` },
        }).select('_id').lean();
    }


    return user?._id?.toString() || null;
}



// Get user id by phone number
async function getUserIdByPhoneNumber(phoneNumber) {
    const normalized = normalizePhone(phoneNumber);
    if (!normalized) return null;

    // Try exact match (if DB already stores normalized)
    let user = await UserModel.findOne({ phoneNumber: normalized }).select('_id').lean();

    // If your DB stores phone with "+" or formatting, try a looser match:
    if (!user) {
        user = await UserModel.findOne({
            phoneNumber: { $regex: `${normalized}$` },
        }).select('_id').lean();
    }


    return user?._id?.toString() || null;
}

module.exports = {
    getCustomerIdByPhoneNumber,
    getInspectionEngineerIdByPhoneNumber,
    getUserIdByPhoneNumber,
};
