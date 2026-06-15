// const LeadsModel = require('../Models/leadsModel');



// // ======================= Fetch Leads =======================
// exports.fetchLeadsList = async (req, res) => {
//     try {
//         const leadsList = await LeadsModel.find().sort({ updatedAt: -1 });

//         res.status(200).json({
//             success: true,
//             data: leadsList,
//         });
//     } catch (error) {
//         console.error('Error fetching leads:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error fetching leads',
//             error: error.message,
//         });
//     }
// };


// // ======================= Add Lead =======================
// exports.addLead = async (req, res) => {
//     try {
//         const {
//             carRegistrationNumber,
//             ownerName,
//             carMakeModelVariant,
//             yearOfRegistration,
//             ownershipSerialNumber,
//             priority,
//             source,
//             yearOfManufacture,
//             make,
//             vehicleStatus,
//             contactNo,
//             zipCode,
//             appointmentId,
//             city,
//             odometerReadingInKms,
//             additionalNotes,
//             carImages,
//             inspectionDateTime,
//             inspectionAddress
//         } = req.body;

//         // Validation for required fields
//         if (!carRegistrationNumber || !ownerName || !carMakeModelVariant || !yearOfRegistration || !ownershipSerialNumber || !priority || !source || !yearOfManufacture || !make || !vehicleStatus || !contactNo || !zipCode || !appointmentId || !city) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'All required fields must be provided.',
//             });
//         }

//         // Create lead
//         const lead = await LeadsModel.create(req.body);

//         res.status(200).json({
//             success: true,
//             data: lead,
//         });
//     } catch (error) {
//         console.error('Error adding lead:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error adding lead',
//             error: error.message,
//         });
//     }
// };

// // ======================= Update Lead =======================
// exports.updateLead = async (req, res) => {
//     try {
//         const {
//             id,
//             carRegistrationNumber,
//             ownerName,
//             carMakeModelVariant,
//             yearOfRegistration,
//             ownershipSerialNumber,
//             priority,
//             source,
//             yearOfManufacture,
//             make,
//             vehicleStatus,
//             contactNo,
//             zipCode,
//             appointmentId,
//             city,
//             odometerReadingInKms,
//             additionalNotes,
//             carImages,
//             inspectionDateTime,
//             inspectionAddress
//         } = req.body;

//         // Validation for required fields
//         if (!id || !carRegistrationNumber || !ownerName || !carMakeModelVariant || !yearOfRegistration || !ownershipSerialNumber || !priority || !source || !yearOfManufacture || !make || !vehicleStatus || !contactNo || !zipCode || !appointmentId || !city) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'All required fields must be provided.',
//             });
//         }

//         // Update lead
//         const lead = await LeadsModel.updateOne({ _id: id }, req.body);

//         res.status(200).json({
//             success: true,
//             data: lead,
//         });
//     } catch (error) {
//         console.error('Error updating lead:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error updating lead',
//             error: error.message,
//         });
//     }
// };
// // ======================= Delete Lead =======================
// exports.deleteLead = async (req, res) => {
//     try {
//         const { leadId } = req.body;

//         if (!leadId) {
//             return res.status(400).json({
//                 success: false,
//                 message: 'Lead ID is required.',
//             });
//         }

//         const lead = await LeadsModel.deleteOne({ _id: leadId });

//         if (!lead.deletedCount) {
//             return res.status(404).json({
//                 success: false,
//                 message: 'Lead not found.',
//             });
//         }

//         res.status(200).json({
//             success: true,
//             message: 'Lead deleted successfully.',
//         });
//     } catch (error) {
//         console.error('Error deleting lead:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error deleting lead',
//             error: error.message,
//         });
//     }
// };
