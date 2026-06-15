// Utils/save_sales_manager_credentials_in_mongo.js
const User = require('../Models/userModel');
const CONSTANTS = require('../Utils/constants');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function saveSalesManagerCredentialsInMongo() {
    const salesManagerName = process.env.SALES_MANAGER_USER_NAME;
    const salesManagerPhone = process.env.SALES_MANAGER_PHONE_NUMBER;
    const salesManagerPassword = process.env.SALES_MANAGER_PASSWORD;
    const salesManagerEmail = "salesmanager@otobix.in";

    const existing = await User.findOne({ email: salesManagerEmail }).select('+password'); // ensure password is selected

    if (existing) {
        // compare phone, username, AND password (hashed)
        const phoneSame = existing.phoneNumber === salesManagerPhone;
        const nameSame = existing.userName === salesManagerName;
        const passwordMatches = await bcrypt.compare(salesManagerPassword, existing.password);

        if (phoneSame && nameSame && passwordMatches) {
            console.log("✅ Sales Manager already exists with the same credentials");
            return;
        }

        // update existing sales manager with new env values
        existing.phoneNumber = salesManagerPhone;
        existing.userName = salesManagerName;

        // only reset password if it's different
        if (!passwordMatches) {
            existing.password = salesManagerPassword; // will be hashed by pre('save') hook
        }

        await existing.save();
        console.log("🔄 Sales Manager updated with new credentials");
        return;
    }

    // create if not found
    const salesManagerUser = new User({
        userRole: CONSTANTS.USER_ROLES.SALES_MANAGER,
        phoneNumber: salesManagerPhone,
        location: "Head Office, Delhi",
        userName: salesManagerName,
        email: salesManagerEmail,
        password: salesManagerPassword, // will be hashed by pre('save') hook
        addressList: ["Head Office, Delhi"],
        approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED,
        secondaryContactPerson: "",
        secondaryContactNumber: "",
        wishlist: [],
        myBids: [],
    });

    await salesManagerUser.save();
    console.log("🆕 Sales Manager created");
}

module.exports = { saveSalesManagerCredentialsInMongo };
