// controllers/user_purchased_cars_controller.js

const UserModel = require('../Models/userModel');
const CarModel = require('../Models/carModel');
const { addPurchasedCarFull } = require('../Helper Functions/purchased_cars_helpers');
const CarDetailsForCarsListModel = require('../Shared/car_details_for_cars_list_model');

// Add to purchased cars
exports.addToPurchasedCars = async (req, res) => {
    try {
        const data = await addPurchasedCarFull(req.body);
        return res.json(data);
    } catch (err) {
        console.error('addToPurchasedCars error:', err);
        return res.status(err.status || 500).json({ error: err.message || 'Server error' });
    }
};

// Get purchased cars count
exports.getUserPurchasedCarsCount = async (req, res) => {
    try {
        const { userId } = req.query;
        const user = await UserModel.findById(userId).select('purchasedCars').lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ purchasedCarsCount: user.purchasedCars || [] });
    } catch (e) {
        console.log(e);
        res.status(500).json({ error: 'Server error' });
    }
};

// Get purchased cars list
exports.getUserPurchasedCarsList = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId is required' });

        // 1) Get purchased cars IDs from user
        const user = await UserModel.findById(userId).select('purchasedCars').lean();
        if (!user) return res.status(404).json({ error: 'User not found' });

        const purchasedCars = (user.purchasedCars || []).map(String);
        if (purchasedCars.length === 0) {
            return res.json({ success: true, purchasedCars: [] });
        }


        // 2) Fetch FULL car docs as lean (no projection = full doc)
        const cars = await CarModel.find({ _id: { $in: purchasedCars } }).lean();

        // keep same order, latest first
        const order = new Map(purchasedCars.map((id, idx) => [id, idx]));
        cars.sort(
            (a, b) => (order.get(String(b._id)) ?? -1) - (order.get(String(a._id)) ?? -1)
        );

        // IMPORTANT: setCarDetails works on a single car
        const carsList = cars.map((car) => CarDetailsForCarsListModel.setCarDetails(car));

        return res.json({ success: true, purchasedCars: carsList });
    } catch (err) {
        console.error('getUserPurchasedCarsList error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

