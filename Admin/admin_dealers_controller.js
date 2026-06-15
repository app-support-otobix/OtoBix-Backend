const UserModel = require('../Models/userModel');
const CONSTANTS = require('../Utils/constants');

exports.getDealersList = async (req, res) => {
    try {
        // 🔹 Use userRole (matches your schema), not "role"
        const dealers = await UserModel.find({
            userRole: CONSTANTS.USER_ROLES.DEALER,
            approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED, // optional but recommended
        }).select('_id userName');

        // 🔹 Return a trimmed list, perfect for dropdowns
        const formatted = dealers.map(d => ({
            id: d._id,
            name: d.userName,
        }));

        return res.json({ success: true, data: formatted });
    } catch (error) {
        console.error('Get dealers list error:', error);
        return res.status(500).json({ error: 'Failed to get dealers list' });
    }
};
