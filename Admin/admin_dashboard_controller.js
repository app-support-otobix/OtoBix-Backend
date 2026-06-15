// admin_dashboard_controller.js
const BidModel = require('../Models/bidModel');
const UserModel = require('../Models/userModel');
const CarModel = require('../Models/carModel');
const CONSTANTS = require('../Utils/constants');

// get dashboard reports summary
exports.getDashboardReportsSummary = async (req, res) => {
    try {
        const now = new Date();

        const [
            totalDealers,
            totalCars,
            upcomingCars,
            liveCars,
            otobuyCars
        ] = await Promise.all([
            // If you only want Approved dealers, add { approvalStatus: 'Approved' }
            UserModel.countDocuments({ userRole: CONSTANTS.USER_ROLES.DEALER }),

            CarModel.countDocuments({}),

            // Cars whose auction hasn't started yet
            CarModel.countDocuments({
                auctionStatus: CONSTANTS.AUCTION_STATUS.UPCOMING
            }),

            // Cars currently live (started and not yet ended)
            CarModel.countDocuments({
                auctionStatus: CONSTANTS.AUCTION_STATUS.LIVE
            }),

            // “OtoBuy”/Instant-buy cars. Tweak these predicates to match your schema.
            CarModel.countDocuments({
                auctionStatus: CONSTANTS.AUCTION_STATUS.OTOBUY
            })
        ]);

        return res.status(200).json({
            ok: true,
            data: {
                totalDealers,
                totalCars,
                upcomingCars,
                liveCars,
                otobuyCars
            }
        });
    } catch (error) {
        console.error('getDashboardReportsSummary error:', error);
        return res.status(500).json({
            ok: false,
            message: 'Failed to load dashboard summary',
            error: error?.message || 'Internal Server Error'
        });
    }
};


// get dealers by months
exports.getDealersByMonths = async (req, res) => {
    try {
        const tz = 'Asia/Karachi';
        const now = new Date();
        const year = Number(req.query.year) || now.getFullYear();

        const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
        const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));

        const pipeline = [
            {
                $match: {
                    userRole: CONSTANTS.USER_ROLES.DEALER,
                    createdAt: { $gte: start, $lt: end }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m', date: '$createdAt', timezone: tz }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ];

        const rows = await UserModel.aggregate(pipeline);

        // Fill missing months with zeros
        const categories = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthMap = new Map(rows.map(r => [r._id, r.count]));

        const detailed = Array.from({ length: 12 }, (_, i) => {
            const monthStr = `${year}-${String(i + 1).padStart(2, '0')}`;
            return { month: monthStr, count: monthMap.get(monthStr) || 0 };
        });

        const series = detailed.map(d => d.count);

        return res.status(200).json({
            ok: true,
            data: {
                year,
                series,
                categories,
                detailed
            }
        });
    } catch (error) {
        console.error('getDealersByMonths error:', error);
        return res.status(500).json({
            ok: false,
            message: 'Failed to load dealers by months',
            error: error?.message || 'Internal Server Error'
        });
    }
};
