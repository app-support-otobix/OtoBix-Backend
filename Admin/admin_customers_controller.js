// Admin/admin_customers_controller.js
const CONSTANTS = require('../Utils/constants');
const UserModel = require('../Models/userModel');
const CarMakeModelVariantModel = require('../Models/carMakeModelVariantModel');
const BannersModel = require('../Models/bannersModel');

// Summary counts
exports.getCustomersSummary = async (req, res) => {
    try {
        // Get the first day of the current month
        const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

        // Use Promise.all to make all DB calls run in parallel for better performance
        const [
            totalCustomersLength,
            activeCustomersLength,
            thisMonthCustomersLength,
            carMakeModelVariantDropdownsLength,
            bannersLength,
        ] = await Promise.all([
            // Count all customers
            UserModel.countDocuments({ userRole: CONSTANTS.USER_ROLES.CUSTOMER }),

            // Count active customers (Approved)
            UserModel.countDocuments({
                approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED,
                userRole: CONSTANTS.USER_ROLES.CUSTOMER,
            }),

            // Count customers created this month (from the start of the month)
            UserModel.countDocuments({
                approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED,
                userRole: CONSTANTS.USER_ROLES.CUSTOMER,
                createdAt: { $gte: firstDayOfMonth },
            }),

            // Count car dropdowns
            CarMakeModelVariantModel.countDocuments(),

            // Count banners
            BannersModel.countDocuments(),
        ]);

        // Respond with the data
        res.status(200).json({
            success: true,
            totalCustomersLength,
            activeCustomersLength,
            thisMonthCustomersLength,
            carMakeModelVariantDropdownsLength,
            bannersLength,
        });
    } catch (error) {

        console.error('Error fetching customer summary:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching summary data',
            error: error.message,
        });
    }
};
