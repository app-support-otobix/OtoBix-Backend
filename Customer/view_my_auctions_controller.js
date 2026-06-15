// customer/view_my_auctions_controller.js

const CarModel = require('../Models/carModel');
const CarDetailsForCarsListModel = require('../Shared/car_details_for_cars_list_model');

require('dotenv').config();

// ======================= Fetch My Auction Cars List =======================
exports.fetchMyAuctionCarsList = async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({
            success: false,
            message: 'Contact number is required.',
        });
    }

    // Convert phoneNumber variable name to contactNumber because car field is contactNumber
    const contactNumber = phoneNumber;

    try {
        // Fetch all cars for this phone number
        const cars = await CarModel.find({ contactNumber }).sort({ updatedAt: -1 });

        // If no documents found, cars will be an empty array, not null
        if (!cars || cars.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No cars found.',
                data: [],
            });
        }

        // Map each car through your shared model formatter
        const formattedCars = cars.map((car) =>
            CarDetailsForCarsListModel.setCarDetails(car)
        );

        return res.status(200).json({
            success: true,
            message: 'Cars fetched successfully.',
            data: formattedCars,
        });
    } catch (error) {
        console.error('Error in fetchMyAuctionCarsList:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.',
            error: error.message,
        });
    }
};
