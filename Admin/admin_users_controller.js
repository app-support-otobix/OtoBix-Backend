// // admin_users_controller.js
// const UserModel = require('../Models/userModel');
// const CONSTANTS = require('../Utils/constants');

// const DEALER_ROLE = CONSTANTS.USER_ROLES.DEALER;


// // ----------- Create New User -----------
// exports.createNewUser = async (req, res) => {
//     try {
//         const {
//             userRole,
//             phoneNumber,
//             location,
//             userName,
//             email,
//             dealershipName,
//             entityType,
//             primaryContactPerson,
//             primaryContactNumber,
//             secondaryContactPerson,
//             secondaryContactNumber,
//             password,
//             addressList
//         } = req.body;

//         if (!userRole || !userName || !email || !phoneNumber || !location || !password || !addressList) {
//             return res.status(404).json({ message: 'Please fill all required fields.' });
//         }

//         if (userRole === CONSTANTS.USER_ROLES.DEALER) {
//             if (!dealershipName || !entityType || !primaryContactPerson || !primaryContactNumber) {
//                 return res.status(404).json({ message: 'Missing required Dealer fields.' });
//             }
//         } else if (![CONSTANTS.USER_ROLES.CUSTOMER, CONSTANTS.USER_ROLES.SALES_MANAGER, CONSTANTS.USER_ROLES.ADMIN].includes(userRole)) {
//             return res.status(404).json({ message: 'Invalid userRole provided.' });
//         }

//         const existingEmail = await User.findOne({ email });
//         if (existingEmail) {
//             return res.status(400).json({ message: 'Email already exists.' });
//         }

//         const existingPhone = await User.findOne({ phoneNumber });
//         if (existingPhone) {
//             return res.status(400).json({ message: 'Phone Number already exists.' });
//         }

//         const user = new User({
//             userRole,
//             phoneNumber,
//             location,
//             userName,
//             email,
//             dealershipName,
//             entityType,
//             primaryContactPerson,
//             primaryContactNumber,
//             secondaryContactPerson: secondaryContactPerson || '',
//             secondaryContactNumber: secondaryContactNumber || '',
//             password,
//             addressList,
//             approvalStatus: CONSTANTS.APPROVAL_STATUS.PENDING
//         });

//         await user.save();

//         await sendEmail(
//             email,
//             'Welcome to Otobix!',
//             `Dear ${userName},\n\nThank you for registering with Otobix.\nYour account is under review.\n\nBest regards,\nTeam Otobix`
//         );

//         res.status(201).json({
//             message: `${userRole} registered successfully!`,
//             user
//         });

//     } catch (error) {
//         console.error('Register error:', error);
//         res.status(500).json({ message: 'Server error' });
//     }
// };


// /**
//  * ---------- Get all KAMs ----------
//  */
// exports.getAllKamsList = async (req, res) => {
//     try {
//         const kams = await KamModel.find({})
//             .sort({ createdAt: -1 })
//             .lean();

//         return res.json({
//             ok: true,
//             data: kams.map((k) => ({
//                 id: k._id,
//                 name: k.name,
//                 email: k.email,
//                 phoneNumber: k.phoneNumber,
//                 region: k.region,
//                 createdAt: k.createdAt,
//                 updatedAt: k.updatedAt,
//             })),
//         });
//     } catch (error) {
//         console.error('getAllKams error:', error);
//         return res.status(500).json({
//             ok: false,
//             message: 'Failed to fetch KAM list',
//             error: error?.message || 'Internal Server Error',
//         });
//     }
// };

// /**
//  * ---------- Update KAM ----------
//  * Params: :id
//  * Body: { name?, email?, phoneNumber?, region? }
//  */
// exports.updateKam = async (req, res) => {
//     try {
//         const { id } = req.body;
//         const { name, email, phoneNumber, region } = req.body || {};

//         const kam = await KamModel.findById(id);
//         if (!kam) {
//             return res.status(404).json({
//                 ok: false,
//                 message: 'KAM not found',
//             });
//         }

//         // Check email/phone uniqueness (excluding this KAM)
//         if (email || phoneNumber) {
//             const dup = await KamModel.findOne({
//                 _id: { $ne: id },
//                 $or: [
//                     ...(email ? [{ email }] : []),
//                     ...(phoneNumber ? [{ phoneNumber }] : []),
//                 ],
//             });

//             if (dup) {
//                 return res.status(400).json({
//                     ok: false,
//                     message: 'Another KAM already exists with same email or phoneNumber',
//                 });
//             }
//         }

//         if (name !== undefined) kam.name = name;
//         if (email !== undefined) kam.email = email;
//         if (phoneNumber !== undefined) kam.phoneNumber = phoneNumber;
//         if (region !== undefined) kam.region = region;

//         await kam.save();

//         return res.json({
//             ok: true,
//             message: 'KAM updated successfully',
//             data: {
//                 id: kam._id,
//                 name: kam.name,
//                 email: kam.email,
//                 phoneNumber: kam.phoneNumber,
//                 region: kam.region,
//             },
//         });
//     } catch (error) {
//         console.error('updateKam error:', error);
//         return res.status(500).json({
//             ok: false,
//             message: 'Failed to update KAM',
//             error: error?.message || 'Internal Server Error',
//         });
//     }
// };

// /**
//  * ---------- Delete KAM ----------
//  * Hard delete + unassign from all dealers
//  */
// exports.deleteKam = async (req, res) => {
//     try {
//         const { id } = req.body;

//         const kam = await KamModel.findById(id);
//         if (!kam) {
//             return res.status(404).json({
//                 ok: false,
//                 message: 'KAM not found',
//             });
//         }

//         // Remove KAM document
//         await KamModel.deleteOne({ _id: id });

//         // Unassign from all dealers that used this KAM
//         await UserModel.updateMany(
//             { userRole: DEALER_ROLE, kamId: id },
//             { $unset: { kamId: '' } }
//         );

//         return res.json({
//             ok: true,
//             message: 'KAM deleted and unassigned from dealers',
//         });
//     } catch (error) {
//         console.error('deleteKam error:', error);
//         return res.status(500).json({
//             ok: false,
//             message: 'Failed to delete KAM',
//             error: error?.message || 'Internal Server Error',
//         });
//     }
// };


// /**
//  * ---------- Assign / Reassign KAM to dealer ----------
//  * Body: { dealerId, kamId? }  // if kamId omitted or null -> unassign
//  */
// exports.assignKamToDealer = async (req, res) => {
//     try {
//         const { dealerId, kamId } = req.body || {};

//         if (!dealerId) {
//             return res.status(400).json({
//                 ok: false,
//                 message: 'dealerId is required',
//             });
//         }

//         // Validate dealer
//         const dealer = await UserModel.findOne({
//             _id: dealerId,
//             userRole: DEALER_ROLE,
//         });

//         if (!dealer) {
//             return res.status(404).json({
//                 ok: false,
//                 message: 'Dealer not found',
//             });
//         }

//         let kam = null;

//         if (kamId) {
//             // Validate KAM from KAM collection
//             kam = await KamModel.findById(kamId);

//             if (!kam) {
//                 return res.status(404).json({
//                     ok: false,
//                     message: 'KAM not found',
//                 });
//             }

//             dealer.assignedKam = kam._id;
//         } else {
//             // Unassign if kamId is null/empty
//             dealer.assignedKam = '';
//         }

//         await dealer.save();

//         return res.json({
//             ok: true,
//             message: kam
//                 ? 'KAM assigned to dealer successfully'
//                 : 'KAM unassigned from dealer',
//             data: {
//                 dealerId: dealer._id,
//                 kamId: dealer.assignedKam,
//             },
//         });
//     } catch (error) {
//         console.error('assignKamToDealer error:', error);
//         return res.status(500).json({
//             ok: false,
//             message: 'Failed to assign KAM',
//             error: error?.message || 'Internal Server Error',
//         });
//     }
// };
