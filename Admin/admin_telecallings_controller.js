// Admin/admin_telecallings_controller.js

const TeleCallingsModel = require('../Models/telecallingsModel');

// ======================= Fetch Inspection Requests =======================
exports.fetchTeleCallingsList = async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;

        // Convert to integers
        const pageNumber = parseInt(page);
        const pageLimit = parseInt(limit);

        // Fetch inspection requests, sorted by the latest update time
        const teleCallings = await TeleCallingsModel.find()
            .skip((pageNumber - 1) * pageLimit)
            .limit(pageLimit)
            .sort({ updatedAt: -1 });

        // Get the total count of inspection requests for pagination
        const totalCount = await TeleCallingsModel.countDocuments();

        res.status(200).json({
            success: true,
            data: teleCallings,
            pagination: {
                currentPage: pageNumber,
                totalPages: Math.ceil(totalCount / pageLimit),
                total: totalCount,
            },
        });
    } catch (error) {
        console.error('Error fetching telecallings requests:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching telecallings requests',
            error: error.message,
        });
    }
};
