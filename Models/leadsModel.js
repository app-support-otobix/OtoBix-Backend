// const mongoose = require('mongoose');


// const leadsSchema = new mongoose.Schema(
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

//         // New fields other than inspection requests fields
//         priority: {
//             type: String,
//             enum: ['High', 'Medium', 'Low'],
//             required: true,
//         },
//         source: {
//             type: String,
//             required: true,
//         },
//         yearOfManufacture: {
//             type: String,
//             required: true,
//             trim: true,
//         },
//         make: {
//             type: String,
//             required: true,
//         },
//         vehicleStatus: {
//             type: String,
//             required: true,
//         },
//         contactNo: {
//             type: String,
//             required: true,
//         },
//         zipCode: {
//             type: String,
//             required: true,
//         },
//         remarks: {
//             type: String,
//             default: '',
//         },
//         appointmentId: {
//             type: String,
//             required: true,
//         },
//         city: {
//             type: String,
//             required: true,
//         }
//     }, { timestamps: true });
// module.exports = mongoose.model("Leads", leadsSchema, "leads");
