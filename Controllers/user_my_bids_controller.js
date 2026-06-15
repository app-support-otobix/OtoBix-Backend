// controllers/user_my_bids_controller.js
const SocketService = require('../Config/socket_service');
const EVENTS = require('../Sockets/socket_events');
const CONSTANTS = require('../Utils/constants');
const CarDetailsForCarsListModel = require('../Shared/car_details_for_cars_list_model');
const BidModel = require('../Models/bidModel');
const CarModel = require('../Models/carModel');
const UserModel = require('../Models/userModel');
const NotificationsModel = require('../Models/userNotificationsModel');

// Add to myBids
exports.addToMyBids = async (req, res) => {
    try {
        const { userId, carId } = req.body;
        if (!userId || !carId) {
            return res.status(400).json({ error: 'userId and carId are required' });
        }

        const normalizedCarId = String(carId).trim();

        // $addToSet adds only if not already present (atomic, no duplicates)
        const result = await UserModel.updateOne(
            { _id: userId },
            { $addToSet: { myBids: normalizedCarId } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const added = result.modifiedCount === 1; // false means it was already there

        // (optional) return the latest wishlist
        const { myBids } = await UserModel.findById(userId).select('myBids').lean();

        // 🔔 realtime push (only if DB actually changed)
        if (added) {
            SocketService.emitToRoom(`${EVENTS.USER_ROOM}${userId}`, EVENTS.MY_BIDS_UPDATED, {
                action: 'add',
                carId: normalizedCarId,
            });
        }

        return res.json({
            success: true,
            added,              // true if newly added, false if duplicate
            myBids,           // current wishlist array
        });
    } catch (err) {
        console.error('addToMyBids error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// Remove from myBids
exports.removeFromMyBids = async (req, res) => {
    try {
        const { userId, carId } = req.body;
        if (!userId || !carId) {
            return res.status(400).json({ error: 'userId and carId are required' });
        }

        const normalizedCarId = String(carId).trim();

        // $pull removes the value if it exists
        const result = await UserModel.updateOne(
            { _id: userId },
            { $pull: { myBids: normalizedCarId } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const removed = result.modifiedCount === 1; // false means it wasn't in myBids

        // (optional) return updated myBids
        const { myBids } = await UserModel.findById(userId).select('myBids').lean();

        // 🔔 realtime push (only if DB actually changed)
        if (removed) {
            SocketService.emitToRoom(`${EVENTS.USER_ROOM}${userId}`, EVENTS.MY_BIDS_UPDATED, {
                action: 'remove',
                carId: normalizedCarId,
            });
        }

        return res.json({
            success: true,
            removed,            // true if removed, false if not found in myBids
            myBids,           // current myBids array
        });
    } catch (err) {
        console.error('removeFromMyBids error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};


// Get myBids
exports.getUserMyBids = async (req, res) => {
    try {
        const { userId, days } = req.query;
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const windowDays = Number(days) || 30;

        // Reuse your helper: returns [{ carId, lastBidAt }]
        const recent = await getLast30DaysBidsCarIds(userId, windowDays);

        // return only ids (and some helpful meta)
        const ids = recent.map(r => r.carId);

        return res.json({
            success: true,
            myBids: ids,
            meta: {
                days: windowDays,
                total: ids.length,
            },
        });
    } catch (e) {
        console.error('getUserMyBids error:', e);
        res.status(500).json({ error: 'Server error' });
    }
};

// exports.getUserMyBids = async (req, res) => {
//     try {
//         const { userId } = req.query;
//         const user = await UserModel.findById(userId).select('myBids').lean();
//         if (!user) return res.status(404).json({ error: 'User not found' });
//         res.json({ myBids: user.myBids || [] });
//     } catch (e) {
//         res.status(500).json({ error: 'Server error' });
//     }
// };


// Get myBids cars list
// exports.getUserMyBidsCarsList1 = async (req, res) => {

//     try {
//         const { userId } = req.query;
//         if (!userId) return res.status(400).json({ error: 'userId is required' });

//         // 1) Get myBids IDs from user
//         const user = await UserModel.findById(userId).select('myBids').lean();
//         if (!user) return res.status(404).json({ error: 'User not found' });

//         const myBids = (user.myBids || []).map(String);
//         if (myBids.length === 0) {
//             return res.json({ success: true, myBidsCars: [] });
//         }



//         const fresh = await CarModel.findById(myBids).lean();
//         const myBidsCars = CarDetailsForCarsListModel.setCarDetails(fresh);

//         // 3) Keep the same order as the myBids array, but latest first
//         const order = new Map(myBids.map((id, i) => [id, i]));
//         myBidsCars.sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0));


//         return res.json({ success: true, myBidsCars: myBidsCars });
//     }
//     catch (error) {
//         console.error('getUserMyBidsCarsList error:', error);
//         res.status(500).json({ error: 'Server error' });
//     }

// }



// Get myBids cars list
exports.getUserMyBidsCarsList = async (req, res) => {
    try {
        const { userId, days } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId is required' });

        // // 1) Get myBids IDs from user
        // const user = await UserModel.findById(userId).select('myBids').lean();
        // if (!user) return res.status(404).json({ error: 'User not found' });

        // const myBids = (user.myBids || []).map(String);
        // if (myBids.length === 0) {
        //     return res.json({ success: true, myBidsCars: [] });
        // }

        // 1) just get IDs (and ordering key) via helper
        const recent = await getLast30DaysBidsCarIds(userId, Number(days) || 30);
        if (recent.length === 0) {
            return res.json({ success: true, myBidsCars: [] });
        }

        const carIds = recent.map(r => r.carId);
        const orderMap = new Map(recent.map(r => [r.carId, r.lastBidAt]));


        // 2) Fetch minimal fields + image fields needed to compute imageUrl
        const cars = await CarModel.find(
            { _id: { $in: carIds } },
            {
                _id: 1,
                appointmentId: 1,
                make: 1,
                model: 1,
                variant: 1,
                priceDiscovery: 1,
                yearMonthOfManufacture: 1,
                odometerReadingInKms: 1,
                fuelType: 1,
                city: 1,
                approvalStatus: 1,
                frontMain: 1,
                roadTaxValidity: 1,
                taxValidTill: 1,
                ownerSerialNumber: 1,
                commentsOnTransmission: 1,
                registrationNumber: 1,
                registeredRto: 1,


            }
        ).lean();


        const simplified = cars.map((car) => {
            return {
                id: String(car._id),
                appointmentId: (car.appointmentId || '').toString(),
                imageUrl: Array.isArray(car.frontMain) ? (car.frontMain[0] || '') : (car.frontMain || ''),
                make: car.make ?? '',
                model: car.model ?? '',
                variant: car.variant ?? '',
                priceDiscovery: Number(car.priceDiscovery || 0),
                yearMonthOfManufacture: car.yearMonthOfManufacture
                    ?? null,
                odometerReadingInKms: Number(car.odometerReadingInKms || 0),
                fuelType: car.fuelType ?? '',
                inspectionLocation: car.city ?? '',
                isInspected: String(car.approvalStatus || '').toUpperCase() === 'APPROVED',
                roadTaxValidity: car.roadTaxValidity ?? '',
                taxValidTill: car.taxValidTill ?? null,
                ownerSerialNumber: car.ownerSerialNumber ?? 1,
                commentsOnTransmission: car.commentsOnTransmission ?? '',
                registrationNumber: car.registrationNumber ?? '',
                registeredRto: car.registeredRto ?? '',
                lastBidAt: orderMap.get(String(car._id)) || null,
            };
        });

        // // 3) Keep the same order as the myBids array, but latest first
        // const order = new Map(myBids.map((id, i) => [id, i]));
        // simplified.sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0));

        simplified.sort((a, b) => {
            const ta = orderMap.get(a.id)?.getTime?.() || 0;
            const tb = orderMap.get(b.id)?.getTime?.() || 0;
            return tb - ta;
        });


        return res.json({ success: true, myBidsCars: simplified });
    } catch (err) {
        console.error('getMyBidsCars error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};


// Returns all bids made by this user on a specific car.
exports.getUserBidsForCar = async (req, res) => {
    try {
        const { userId, carId } = req.query;
        if (!userId || !carId) {
            return res.status(400).json({ error: 'userId and carId are required' });
        }

        // Find bids for this car & user
        const bids = await BidModel.find({
            carId,
            userId,
            isSystemBid: { $ne: true }, // excludes true, keeps false + missing
        })
            .sort({ time: -1 }) // latest first
            .lean();

        // Optional: include some car info
        const car = await CarModel.findById(carId)
            .select('make model variant priceDiscovery auctionStatus highestBid highestBidder')
            .lean();

        // Format
        const response = bids.map((b) => ({
            bidAmount: b.bidAmount,
            time: b.time,
            isActive: b.isActive,
        }));

        return res.json({
            success: true,
            car: car
                ? {
                    id: car._id,
                    name: `${car.make ?? ''} ${car.model ?? ''} ${car.variant ?? ''}`.trim(),
                    priceDiscovery: car.priceDiscovery ?? 0,
                }
                : null,
            auctionStatus: car?.auctionStatus ?? '',
            highestBid: car?.highestBid ?? '',
            highestBidColor: getHighestBidColor(userId, car),
            bids: response,
        });
    } catch (err) {
        console.error('getUserBidsForCar error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};


// Helper function to get highest bid color
function getHighestBidColor(currentUserId, car) {
    // If we don't have car or highestBidder, treat as not highest (=> red)
    if (!car || car.highestBidder == null) return 'red';

    const isUserHighest = String(car.highestBidder) === String(currentUserId);
    return isUserHighest ? 'green' : 'red';
}



// Helpers
// Get carIds (from user.myBids) that the user actually bid on in the last `30` days.
async function getLast30DaysBidsCarIds(userId, days = 30) {
    // 0) read watchlist
    const user = await UserModel.findById(userId).select('myBids').lean();
    if (!user) return [];

    const watchlist = (user.myBids || []).map(String).filter(Boolean);
    if (watchlist.length === 0) return [];

    // 1) compute window
    const since = new Date(Date.now() - Math.max(1, Number(days)) * 24 * 60 * 60 * 1000);

    // 2) aggregate bids → one row per car with lastBidAt
    const rows = await BidModel.aggregate([
        {
            $match: {
                userId: String(userId),
                carId: { $in: watchlist },
                time: { $gte: since },
            },
        },
        {
            $group: {
                _id: '$carId',
                lastBidAt: { $max: '$time' },
            },
        },
        { $sort: { lastBidAt: -1 } },
    ]);

    // 3) normalize
    return rows.map(r => ({ carId: String(r._id), lastBidAt: r.lastBidAt }));
}
