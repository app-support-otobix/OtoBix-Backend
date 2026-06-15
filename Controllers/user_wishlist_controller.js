const UserModel = require('../Models/userModel');
const SocketService = require('../Config/socket_service');
const EVENTS = require('../Sockets/socket_events');
const CarModel = require('../Models/carModel');
const CarDetailsForCarsListModel = require('../Shared/car_details_for_cars_list_model');

// Add to wishlist
exports.addToWishlist = async (req, res) => {
    try {
        const { userId, carId } = req.body;
        if (!userId || !carId) {
            return res.status(400).json({ error: 'userId and carId are required' });
        }

        const normalizedCarId = String(carId).trim();

        // $addToSet adds only if not already present (atomic, no duplicates)
        const result = await UserModel.updateOne(
            { _id: userId },
            { $addToSet: { wishlist: normalizedCarId } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const added = result.modifiedCount === 1; // false means it was already there

        // (optional) return the latest wishlist
        const { wishlist } = await UserModel.findById(userId).select('wishlist').lean();

        // 🔔 realtime push (only if DB actually changed)
        if (added) {
            SocketService.emitToRoom(`${EVENTS.USER_ROOM}${userId}`, EVENTS.WISHLIST_UPDATED, {
                action: 'add',
                carId: normalizedCarId,
            });
        }

        return res.json({
            success: true,
            added,              // true if newly added, false if duplicate
            wishlist,           // current wishlist array
        });
    } catch (err) {
        console.error('addToWishlist error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Remove from wishlist
exports.removeFromWishlist = async (req, res) => {
    try {
        const { userId, carId } = req.body;
        if (!userId || !carId) {
            return res.status(400).json({ error: 'userId and carId are required' });
        }

        const normalizedCarId = String(carId).trim();

        // $pull removes the value if it exists
        const result = await UserModel.updateOne(
            { _id: userId },
            { $pull: { wishlist: normalizedCarId } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const removed = result.modifiedCount === 1; // false means it wasn't in wishlist

        // (optional) return updated wishlist
        const { wishlist } = await UserModel.findById(userId).select('wishlist').lean();

        // 🔔 realtime push (only if DB actually changed)
        if (removed) {
            SocketService.emitToRoom(`${EVENTS.USER_ROOM}${userId}`, EVENTS.WISHLIST_UPDATED, {
                action: 'remove',
                carId: normalizedCarId,
            });
        }

        return res.json({
            success: true,
            removed,            // true if removed, false if not found in wishlist
            wishlist,           // current wishlist array
        });
    } catch (err) {
        console.error('removeFromWishlist error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};


// Get wishlist
exports.getUserWishlist = async (req, res) => {
    try {
        const { userId } = req.query;
        const user = await UserModel.findById(userId).select('wishlist').lean();
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ wishlist: user.wishlist || [] });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
};

// Get wishlist cars list
exports.getUserWishlistCarsList = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId is required' });

        // 1) Get wishlist IDs from user
        const user = await UserModel.findById(userId).select('wishlist').lean();
        if (!user) return res.status(404).json({ error: 'User not found' });

        const wishlist = (user.wishlist || []).map(String);
        if (wishlist.length === 0) {
            return res.json({ success: true, myWishlistCars: [] });
        }


        // // 2) Fetch minimal fields + image fields needed to compute imageUrl
        // const cars = await CarModel.find(
        //     { _id: { $in: wishlist } },
        //     {
        //         _id: 1,
        //         appointmentId: 1,
        //         make: 1,
        //         model: 1,
        //         variant: 1,
        //         priceDiscovery: 1,
        //         yearMonthOfManufacture: 1,
        //         odometerReadingInKms: 1,
        //         fuelType: 1,
        //         city: 1,
        //         approvalStatus: 1,
        //         frontMain: 1,
        //         roadTaxValidity: 1,
        //         taxValidTill: 1,
        //         ownerSerialNumber: 1,
        //         commentsOnTransmission: 1,
        //         registrationNumber: 1,
        //         registeredRto: 1,
        //     }
        // ).lean();


        // const simplified = cars.map((car) => {
        //     return {
        //         id: String(car._id),
        //         appointmentId: (car.appointmentId || '').toString(),
        //         imageUrl: Array.isArray(car.frontMain) ? (car.frontMain[0] || '') : (car.frontMain || ''),
        //         make: car.make ?? '',
        //         model: car.model ?? '',
        //         variant: car.variant ?? '',
        //         priceDiscovery: Number(car.priceDiscovery || 0),
        //         yearMonthOfManufacture: car.yearMonthOfManufacture
        //             ?? null,
        //         odometerReadingInKms: Number(car.odometerReadingInKms || 0),
        //         fuelType: car.fuelType ?? '',
        //         inspectionLocation: car.city ?? '',
        //         isInspected: String(car.approvalStatus || '').toUpperCase() === 'APPROVED',
        //         roadTaxValidity: car.roadTaxValidity ?? '',
        //         taxValidTill: car.taxValidTill ?? null,
        //         ownerSerialNumber: car.ownerSerialNumber ?? 1,
        //         commentsOnTransmission: car.commentsOnTransmission ?? '',
        //         registrationNumber: car.registrationNumber ?? '',
        //         registeredRto: car.registeredRto ?? '',
        //     };
        // });

        // // 3) Keep the same order as the wishlist array, but latest first
        // const order = new Map(wishlist.map((id, i) => [id, i]));
        // simplified.sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0));


        // 2) Fetch FULL car docs as lean (no projection = full doc)
        const cars = await CarModel.find({ _id: { $in: wishlist } }).lean();

        // keep same order, latest first
        const order = new Map(wishlist.map((id, idx) => [id, idx]));
        cars.sort(
            (a, b) => (order.get(String(b._id)) ?? -1) - (order.get(String(a._id)) ?? -1)
        );

        // IMPORTANT: setCarDetails works on a single car
        const carsList = cars.map((car) => CarDetailsForCarsListModel.setCarDetails(car));


        return res.json({ success: true, myWishlistCars: carsList });
    } catch (err) {
        console.error('getMyWishlistCars error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

