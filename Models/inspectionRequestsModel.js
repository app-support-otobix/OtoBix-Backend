// const mongoose = require('mongoose');


// const inspectionRequestsSchema = new mongoose.Schema(
//     {
//         carRegistrationNumber: {
//             type: String,
//             required: true,
//             unique: true,
//             trim: true,
//         },
//         ownerName: {
//             type: String,
//             required: true,
//             trim: true,
//         },
//         carMakeModelVariant: {
//             type: String,
//             required: true,
//             trim: true,
//         },
//         yearOfRegistration: {
//             // if you prefer Number, change to Number
//             type: String,
//             required: true,
//             trim: true,
//         },
//         ownershipSerialNumber: {
//             type: String,
//             required: true,
//             trim: true,
//         },

//         // optional
//         odometerReadingInKms: {
//             type: Number,
//         },
//         additionalNotes: {
//             type: String,
//             trim: true,
//         },
//         carImages: [
//             {
//                 type: String, // Cloudinary URLs
//             },
//         ],
//         inspectionDateTime: {
//             type: Date,
//         },
//         inspectionAddress: {
//             type: String,
//             trim: true,
//         },
//     },
//     {
//         timestamps: true,

//     }
// );

// module.exports = mongoose.model("InspectionRequests", inspectionRequestsSchema, "inspectionRequests");
