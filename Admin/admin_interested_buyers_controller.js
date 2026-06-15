// Admin/admin_interested_buyers_controller.js
const mongoose = require("mongoose");
const InterestedBuyersModel = require("../Models/interestedBuyersModel");
const UserModel = require("../Models/userModel");

// ======================= Fetch Interested Buyers =======================
exports.fetchInterestedBuyersList = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const pageNumber = parseInt(page, 10);
    const pageLimit = parseInt(limit, 10);

    const skip = (pageNumber - 1) * pageLimit;

    // Fetch paginated data
    const interestedBuyers = await InterestedBuyersModel.find()
      .skip(skip)
      .limit(pageLimit)
      .sort({ updatedAt: -1 })
      .lean(); // important so we can safely add fields

    // Collect valid customer ids
    const customerIds = [
      ...new Set(
        interestedBuyers
          .map((x) => x.interestedBuyerId)
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
      ),
    ];

    // Fetch users in one query
    const users = await UserModel.find(
      { _id: { $in: customerIds } },
      { phoneNumber: 1, userName: 1 }
    ).lean();

    // Create a map for quick lookup
    const userMap = new Map(
      users.map((u) => [
        String(u._id),
        { customerPhoneNumber: u.phoneNumber || "", customerUserName: u.userName || "" },
      ])
    );

    // Attach fields to each record
    const dataWithCustomer = interestedBuyers.map((item) => {
      const customer = userMap.get(String(item.interestedBuyerId)) || {
        customerPhoneNumber: "",
        customerUserName: "",
      };

      return {
        ...item,
        ...customer,
      };
    });

    const totalCount = await InterestedBuyersModel.countDocuments();

    return res.status(200).json({
      success: true,
      data: dataWithCustomer,
      pagination: {
        currentPage: pageNumber,
        totalPages: Math.ceil(totalCount / pageLimit),
        total: totalCount,
      },
    });
  } catch (error) {
    console.error("Error fetching interested buyers requests:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching interested buyers requests",
      error: error.message,
    });
  }
};


// // Admin/admin_interested_buyers_controller.js

// const InterestedBuyersModel = require('../Models/interestedBuyersModel');
// const UserModel = require('../Models/userModel');

// // ======================= Fetch Interested Buyers =======================
// exports.fetchInterestedBuyersList = async (req, res) => {
//     try {
//         const { page = 1, limit = 10 } = req.query;

//         // Convert to integers
//         const pageNumber = parseInt(page);
//         const pageLimit = parseInt(limit);

//         // Fetch inspection requests, sorted by the latest update time
//         const interestedBuyers = await InterestedBuyersModel.find()
//             .skip((pageNumber - 1) * pageLimit)
//             .limit(pageLimit)
//             .sort({ updatedAt: -1 });

//         // Get the total count of inspection requests for pagination
//         const totalCount = await InterestedBuyersModel.countDocuments();

//         res.status(200).json({
//             success: true,
//             data: interestedBuyers,
//             pagination: {
//                 currentPage: pageNumber,
//                 totalPages: Math.ceil(totalCount / pageLimit),
//                 total: totalCount,
//             },
//         });
//     } catch (error) {
//         console.error('Error fetching interested buyers requests:', error);
//         res.status(500).json({
//             success: false,
//             message: 'Error fetching interested buyers requests',
//             error: error.message,
//         });
//     }
// };
