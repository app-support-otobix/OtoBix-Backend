// Utils/seed_admin.js
const User = require('../Models/userModel');
const CONSTANTS = require('../Utils/constants');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function saveAdminCredentialsInMongo() {
    const adminEmail = "admin@otobix.in"; // fixed, or move to .env if you want
    const adminPhone = process.env.ADMIN_PHONE_NUMBER;
    const adminName = process.env.ADMIN_USER_NAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    const existing = await User.findOne({ email: adminEmail }).select('+password'); // ensure password is selected

    if (existing) {
        // compare phone, username, AND password (hashed)
        const phoneSame = existing.phoneNumber === adminPhone;
        const nameSame = existing.userName === adminName;
        const passwordMatches = await bcrypt.compare(adminPassword, existing.password);

        if (phoneSame && nameSame && passwordMatches) {
            console.log("✅ Admin already exists with the same credentials");
            return;
        }

        // update existing admin with new env values
        existing.phoneNumber = adminPhone;
        existing.userName = adminName;

        // only reset password if it's different
        if (!passwordMatches) {
            existing.password = adminPassword; // will be hashed by pre('save') hook
        }

        await existing.save();
        console.log("🔄 Admin updated with new credentials");
        return;
    }

    // create if not found
    const adminUser = new User({
        userRole: CONSTANTS.USER_ROLES.ADMIN,
        phoneNumber: adminPhone,
        location: "Head Office, Delhi",
        userName: adminName,
        email: adminEmail,
        password: adminPassword, // will be hashed by pre('save') hook
        addressList: ["Head Office, Delhi"],
        approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED,
        secondaryContactPerson: "",
        secondaryContactNumber: "",
        wishlist: [],
        myBids: [],
    });

    await adminUser.save();
    console.log("🆕 Default admin created");
}

module.exports = { saveAdminCredentialsInMongo };
