
// Models/interestedBuyersModel.js
const mongoose = require("mongoose");

const interestedBuyersSchema = new mongoose.Schema(
    {
        // User data
        dealerDocId: { type: String, default: "" },
        dealerPhoneNumber: { type: String, default: "" },
        dealerRole: { type: String, default: "" },
        dealerCity: { type: String, default: "" },
        dealerName: { type: String, default: "" },
        dealerAssignedPhone: { type: String, default: "" },
        dealerState: { type: String, default: "" },
        dealerUserId: { type: String, default: "" },
        dealerEmail: { type: String, default: "" },
        dealerUserName: { type: String, default: "" },

        // Car data
        carDocId: { type: String, default: "" },
        carContact: { type: String, default: "" },
        carName: { type: String, default: "" },
        carDesc: { type: String, default: "" },
        carPrice: { type: String, default: "" },
        carYear: { type: String, default: "" },
        carTaxValidity: { type: String, default: "" },
        carOwnershipSerialNo: { type: String, default: "" },
        carMake: { type: String, default: "" },
        carModel: { type: String, default: "" },
        carVariant: { type: String, default: "" },
        carKms: { type: String, default: "" },
        carTransmission: { type: String, default: "" },
        carFuelType: { type: String, default: "" },
        carBodyType: { type: String, default: "" },
        carImageUrls: {
            type: [{ path: { type: String, default: "" }, status: { type: Boolean, default: false }, url: { type: String, default: "" } }],
            default: [],
        },

        // Other related data
        isDeleted: { type: Boolean, default: false },
        scrapedAt: { type: Date, default: null },
        uploadedAt: { type: Date, default: null },

        // Customer app related data
        activityType: { type: String, default: "interested" }, // the button customer clicked in buy a car screen
        interestedBuyerId: { type: String, default: "" }, // customer mongo id
    },
    { timestamps: true }
);

module.exports = mongoose.model(
    "InterestedBuyers",
    interestedBuyersSchema,
    "interestedBuyers"
);
