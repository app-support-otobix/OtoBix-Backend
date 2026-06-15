// Utils/save_retailer_credentials_in_mongo.js
const User = require('../Models/userModel');
const CONSTANTS = require('../Utils/constants');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function saveRetailerCredentialsInMongo() {
    const retailerName = process.env.RETAILER_USER_NAME;
    const retailerPhone = process.env.RETAILER_PHONE_NUMBER;
    const retailerPassword = process.env.RETAILER_PASSWORD;
    const retailerEmail = "retailer@otobix.in";

    const existing = await User.findOne({ email: retailerEmail }).select('+password'); // ensure password is selected

    if (existing) {
        // compare phone, username, AND password (hashed)
        const phoneSame = existing.phoneNumber === retailerPhone;
        const nameSame = existing.userName === retailerName;
        const passwordMatches = await bcrypt.compare(retailerPassword, existing.password);

        if (phoneSame && nameSame && passwordMatches) {
            console.log("✅ Retailer already exists with the same credentials");
            return;
        }

        // update existing retailer with new env values
        existing.phoneNumber = retailerPhone;
        existing.userName = retailerName;

        // only reset password if it's different
        if (!passwordMatches) {
            existing.password = retailerPassword; // will be hashed by pre('save') hook
        }

        await existing.save();
        console.log("🔄 Retailer updated with new credentials");
        return;
    }

    // create if not found
    const retailerUser = new User({
        userRole: CONSTANTS.USER_ROLES.RETAILER,
        phoneNumber: retailerPhone,
        location: "Head Office, Delhi",
        userName: retailerName,
        email: retailerEmail,
        password: retailerPassword, // will be hashed by pre('save') hook
        addressList: ["Head Office, Delhi"],
        approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED,
        secondaryContactPerson: "",
        secondaryContactNumber: "",
        wishlist: [],
        myBids: [],
    });

    await retailerUser.save();
    console.log("🆕 Retailer created");
}

module.exports = { saveRetailerCredentialsInMongo };
