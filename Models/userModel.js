const mongoose = require('mongoose');
const CONSTANTS = require('../Utils/constants');
const bcrypt = require('bcryptjs');

const userschema = new mongoose.Schema({
    userRole: {
        type: String,
        enum: [
            CONSTANTS.USER_ROLES.ADMIN,
            CONSTANTS.USER_ROLES.DEALER,
            CONSTANTS.USER_ROLES.CUSTOMER,
            CONSTANTS.USER_ROLES.INSPECTION_ENGINEER,
            CONSTANTS.USER_ROLES.SALES_MANAGER,
            CONSTANTS.USER_ROLES.RETAILER,
            CONSTANTS.USER_ROLES.TELECALLER, 
            CONSTANTS.USER_ROLES.QC, 
            CONSTANTS.USER_ROLES.DEALER_AS_SELLER,
        ],
        required: true,
    },
    phoneNumber: {
        type: String,
        required: true,
        unique: true,
    },
    location: {
        type: String,
        required: true,
    },

    userName: {
        type: String,
        required: true,
    },
    email: {
        type: String,
        required: true,
        // sparse: true,
        unique: true,
    },

    // Dealer-only fields
    dealershipName: {
        type: String,
        required: function () {
            return this.userRole === CONSTANTS.USER_ROLES.DEALER;
        },
    },
    image: {
        type: String,
        default: '',
    },
    entityType: {
        type: String,
        required: function () {
            return this.userRole === CONSTANTS.USER_ROLES.DEALER;
        },
    },
    primaryContactPerson: {
        type: String,
        required: function () {
            return this.userRole === CONSTANTS.USER_ROLES.DEALER;
        },
    },
    primaryContactNumber: {
        type: String,
        required: function () {
            return this.userRole === CONSTANTS.USER_ROLES.DEALER;
        },
    },
    secondaryContactPerson: {
        type: String,
        default: '',
    },
    secondaryContactNumber: {
        type: String,
        default: '',
    },

    password: {
        type: String,
        required: true,
        select: false,
    },
    addressList: [
        {
            type: String,
            required: true,
        }
    ],
    approvalStatus: {
        type: String,
        enum: [CONSTANTS.APPROVAL_STATUS.PENDING, CONSTANTS.APPROVAL_STATUS.APPROVED, CONSTANTS.APPROVAL_STATUS.REJECTED],
        default: CONSTANTS.APPROVAL_STATUS.PENDING,
        required: true,
    },
    rejectionComment: {
        type: String,
        default: '',
    },
    wishlist: {
        type: [String],
        default: [],
    },
    myBids: {
        type: [String],
        default: [],
    },
    purchasedCars: {
        type: [String],
        default: [],
    },

    // KAM assigned to this dealer (only meaningful when userRole == DEALER)
    assignedKam: {
        type: String,
        default: '',
    },
    isStaff: {
        type: Boolean,
        default: false,
    },
    whatsappConsent: {
        type: Boolean,
        default: false,
    },
    permissions: {
        type: [String],
        enum: [
            CONSTANTS.USER_PERMISSIONS.VIEW_HOME,
            CONSTANTS.USER_PERMISSIONS.VIEW_ADMIN,
            CONSTANTS.USER_PERMISSIONS.VIEW_LEADS,
            CONSTANTS.USER_PERMISSIONS.VIEW_INSPECTION,
            CONSTANTS.USER_PERMISSIONS.VIEW_PRICE_DISCOVERY,
            CONSTANTS.USER_PERMISSIONS.VIEW_AUCTION,
        ],
        default: [],
    },

}, { timestamps: true });


// Work factor (cost). 10–12 is common in APIs.
const BCRYPT_ROUNDS = 10;

// Hash before save if modified
userschema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
    next();
});

// Hash on findOneAndUpdate when password is present
userschema.pre('findOneAndUpdate', async function (next) {
    try {
        const update = this.getUpdate() || {};

        // Read the password whether it’s direct or inside $set
        const plain =
            (update.$set && update.$set.password) ??
            update.password;

        if (!plain) return next();

        const hash = await bcrypt.hash(plain, BCRYPT_ROUNDS);

        if (update.$set && update.$set.password) {
            update.$set.password = hash;
        } else {
            update.password = hash;
        }

        // Make sure Mongoose uses the mutated update object
        this.setUpdate(update);
        next();
    } catch (err) {
        next(err);
    }
});


// Compare method for login
userschema.methods.comparePassword = function (candidate) {
    // this.password may be undefined if not selected; callers should .select('+password')
    return bcrypt.compare(candidate, this.password);
};



module.exports = mongoose.model('User', userschema);
