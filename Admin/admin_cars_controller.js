// Admin/admin_cars_controller.js
const CarModel = require('../Models/carModel');
const OtobuyOffersModel = require('../Models/otobuyOffersModel');
const CONSTANTS = require('../Utils/constants');
const BidModel = require('../Models/bidModel');
const UserModel = require('../Models/userModel');
const SocketService = require('../Config/socket_service');
const EVENTS = require('../Sockets/socket_events');
const { FIXED_MARGIN } = require('../Helper Functions/car_margin_helper');

// Summary counts
exports.getCarsSummary = async (req, res) => {
    try {
        // Use Promise.all to make all DB calls run in parallel for better performance
        const [
            totalCars,
            upcomingCars,
            liveCars,
            otobuyCars,
            // marketplaceCars,
            auctionEndedCars,
            soldCars,
            // otobuyEndedCars,
            removedCars
        ] = await Promise.all([
            CarModel.countDocuments(),
            CarModel.countDocuments({ auctionStatus: CONSTANTS.AUCTION_STATUS.UPCOMING }),
            CarModel.countDocuments({ auctionStatus: CONSTANTS.AUCTION_STATUS.LIVE }),
            CarModel.countDocuments({ auctionStatus: CONSTANTS.AUCTION_STATUS.OTOBUY }),
            // CarModel.countDocuments({ auctionStatus: CONSTANTS.AUCTION_STATUS.MARKETPLACE }),
            CarModel.countDocuments({ auctionStatus: CONSTANTS.AUCTION_STATUS.LIVEAUCTIONENDED }),
            CarModel.countDocuments({ auctionStatus: CONSTANTS.AUCTION_STATUS.SOLD }),
            // CarModel.countDocuments({ auctionStatus: CONSTANTS.AUCTION_STATUS.OTOBUYENDED }),
            CarModel.countDocuments({ auctionStatus: CONSTANTS.AUCTION_STATUS.REMOVED }),
        ]);

        res.status(200).json({
            success: true,
            totalCars,
            upcomingCars,
            liveCars,
            otobuyCars,
            // marketplaceCars,
            auctionEndedCars,
            soldCars,
            // otobuyEndedCars,
            removedCars,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};




// Cars List
// --- tiny helpers ---
function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
}
function parsePageAndLimit(req) {
    const page = clamp(parseInt(req.query.page || '1', 10) || 1, 1, 1_000_000);
    const limit = clamp(parseInt(req.query.limit || '25', 10) || 25, 1, 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}
function pickYear(d) {
    try {
        if (!d) return '';
        const dd = new Date(d);
        if (!isNaN(dd)) return String(dd.getUTCFullYear());
    } catch (_) { }
    return '';
}
function pickThumb(doc) {
    // prefer a nice main shot; fall back to any available array field
    const arrays = [doc.frontMain, doc.lhsFront45Degree, doc.rearMain];
    for (const arr of arrays) {
        if (Array.isArray(arr) && arr.length) return String(arr[0]);
    }
    // single-value fallbacks
    if (typeof doc.rearWithBootDoorOpen === 'string' && doc.rearWithBootDoorOpen)
        return doc.rearWithBootDoorOpen;
    return '';
}
function makeTitle(doc) {
    const base = [doc.make, doc.model, doc.variant].filter(Boolean).join(' ');
    const year = pickYear(doc.yearMonthOfManufacture);
    return [base, year].filter(Boolean).join(' ');
}

// --- main: cars list function (latest-first, filtered by auctionStatus) ---
exports.getCarsList = async (req, res) => {
    try {
        const { page, limit, skip } = parsePageAndLimit(req);

        const searchRaw = (req.query.search || '').toString().trim();
        const searchRegex = buildSearchRegex(searchRaw);

        const rawStatus = req.query.status;
        let statuses = [];
        if (Array.isArray(rawStatus)) {
            statuses = rawStatus.flatMap(s => String(s).split(','));
        } else if (typeof rawStatus === 'string') {
            statuses = String(rawStatus).split(',');
        }

        const allowed = new Set(Object.values(CONSTANTS.AUCTION_STATUS).map(s => String(s)));
        const cleaned = statuses
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => s.toLowerCase());

        const normalized = [];
        for (const s of cleaned) {
            const match = [...allowed].find(a => a.toLowerCase() === s);
            if (match) normalized.push(match);
        }

        const filter = {};
        const wantsAll = cleaned.includes('all');
        if (!wantsAll && normalized.length) {
            filter.auctionStatus = { $in: normalized };
        }

        if (searchRegex) {
            filter.appointmentId = { $regex: searchRegex };
        }

        const sort = { updatedAt: -1, createdAt: -1, _id: -1 };

        // 👇 add soldAt + soldTo to projection
        const fields =
            'appointmentId make model variant yearMonthOfManufacture city ' +
            'odometerReadingInKms highestBid auctionStatus frontMain ' +
            'lhsFront45Degree rearMain rearWithBootDoorOpen createdAt updatedAt ' +
            'soldAt soldTo customerExpectedPrice priceDiscovery fixedMargin variableMargin';

        // 1) load cars + total
        const [docs, total] = await Promise.all([
            CarModel.find(filter).select(fields).sort(sort).skip(skip).limit(limit).lean(),
            CarModel.countDocuments(filter),
        ]);

        // 2) collect buyer IDs (soldTo) and load users once
        const buyerIds = [
            ...new Set(
                docs
                    .map(d => d.soldTo)
                    .filter(Boolean)
                    .map(id => String(id))
            ),
        ];

        let buyers = [];
        if (buyerIds.length) {
            buyers = await UserModel.find({ _id: { $in: buyerIds } })
                .select('userName email')
                .lean();
        }

        const buyerMap = new Map(
            buyers.map(u => [String(u._id), u])
        );

        // 3) map docs -> DTO for Flutter
        const cars = docs.map(d => {
            const thumb = pickThumb(d);
            const title = makeTitle(d) || 'Car';

            const soldAt = typeof d.soldAt === 'number' ? d.soldAt : 0;
            let soldToName = '';

            if (d.soldTo) {
                const buyer = buyerMap.get(String(d.soldTo));
                if (buyer) {
                    soldToName = buyer.userName || buyer.email || '';
                }
            }

            return {
                id: String(d._id),
                appointmentId: d.appointmentId || 'Unknown appointment ID',
                title,
                city: d.city || 'Unknown',
                odometerKm: typeof d.odometerReadingInKms === 'number'
                    ? d.odometerReadingInKms
                    : 0,
                highestBid: typeof d.highestBid === 'number'
                    ? d.highestBid
                    : 0,
                auctionStatus: d.auctionStatus || 'unknown',
                thumbnailUrl: thumb,
                customerExpectedPrice: Number(d.customerExpectedPrice?.valueOf?.() ?? d.customerExpectedPrice) || 0,
                priceDiscovery: Number(d.priceDiscovery?.valueOf?.() ?? d.priceDiscovery) || 0,
                fixedMargin: Number(d.fixedMargin?.valueOf?.() ?? d.fixedMargin) || 0,
                variableMargin: Number(d.variableMargin?.valueOf?.() ?? d.variableMargin) || 0,

                // 👇 NEW
                soldAt,
                soldToName,
            };
        });

        const totalPages = Math.max(1, Math.ceil(total / limit));
        const hasNext = page < totalPages;
        const hasPrev = page > 1;


        return res.json({
            success: true,
            data: {
                cars,
                pagination: { page, limit, total, totalPages, hasNext, hasPrev },
            },
        });
    } catch (err) {
        console.error('getCarsList error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};




// Get per-dealer highest bids for a given car
exports.getHighestBidsOnCar = async (req, res) => {
    try {
        const { carId } = req.body;

        if (!carId) {
            return res.status(400).json({
                success: false,
                message: 'carId is required in request body',
            });
        }

        // Step 1: Find all bids for this car
        const bids = await BidModel.find({ carId: carId })
            .sort({ bidAmount: -1, time: -1 }) // Highest bid first, then latest
            .lean();

        if (!bids.length) {
            return res.status(200).json({
                success: true,
                carId,
                dealers: [],
                message: 'No bids found for this car'
            });
        }

        // Step 2: Get unique user IDs from bids
        const userIds = [...new Set(bids.map(bid => bid.userId))];

        // Step 3: Get user details for all bidders
        const users = await UserModel.find({
            _id: { $in: userIds }
        }).select('userName dealershipName phoneNumber email').lean();

        // Create a map for quick user lookup
        const userMap = {};
        users.forEach(user => {
            userMap[user._id.toString()] = {
                userName: user.userName || 'Unknown Dealer',
                dealershipName: user.dealershipName || '',
                phoneNumber: user.phoneNumber || '',
                email: user.email || ''
            };
        });

        // Step 4: Find highest bid for each dealer
        const dealerHighestBids = {};

        bids.forEach(bid => {
            const userId = bid.userId;

            // If we haven't seen this dealer yet, or if this bid is higher
            if (!dealerHighestBids[userId] || bid.bidAmount > dealerHighestBids[userId].highestBid) {
                dealerHighestBids[userId] = {
                    highestBid: bid.bidAmount,
                    bidTime: bid.time,
                    userId: userId,

                    // ✅ add margins from bid doc
                    fixedMargin: Number(bid.fixedMargin?.valueOf?.() ?? bid.fixedMargin) || 0,
                    variableMargin: Number(bid.variableMargin?.valueOf?.() ?? bid.variableMargin) || 0,

                };
            }
        });

        // Step 5: Format the final response
        const results = Object.values(dealerHighestBids)
            .map(dealerBid => {
                const userInfo = userMap[dealerBid.userId] || {
                    userName: 'Unknown Dealer',
                    dealershipName: '',
                    phoneNumber: '',
                    email: ''
                };

                return {
                    userId: dealerBid.userId,
                    highestBid: dealerBid.highestBid,
                    bidTime: dealerBid.bidTime,

                    // ✅ include margins
                    fixedMargin: dealerBid.fixedMargin,
                    variableMargin: dealerBid.variableMargin,

                    userName: userInfo.userName,
                    dealershipName: userInfo.dealershipName,
                    phoneNumber: userInfo.phoneNumber,
                    email: userInfo.email
                };
            })
            .sort((a, b) => b.highestBid - a.highestBid); // Sort by highest bid descending

        return res.status(200).json({
            success: true,
            carId,
            dealers: results
        });

    } catch (err) {
        console.error('getHighestBidsOnCar error:', err);
        return res.status(500).json({
            success: false,
            message: 'Server error: ' + err.message
        });
    }
};


// Set car variable margin
exports.setCarVariableMargin = async (req, res) => {

    try {
        const { carId, userId, variableMargin, bidAmount } = req.body;


        if (!carId || !variableMargin || variableMargin === undefined || variableMargin === null) {
            return res.status(400).json({ success: false, message: 'carId and variableMargin are required' });
        }

        const newMargin = Number(variableMargin);
        if (!Number.isFinite(newMargin)) {
            return res.status(400).json({ success: false, message: 'Variable Margin must be a valid number' });
        }


        // Find the current car document
        const currentCar = await CarModel.findById(carId).lean();
        if (!currentCar) {
            return res.status(404).json({
                success: false,
                message: 'Car not found.',
            });
        }

        // const oldMargin = Number(currentCar.variableMargin ?? 0);

        const rawOld = currentCar.variableMargin;

        // true only when field is actually missing or null
        const isUnset =
            rawOld === undefined ||
            rawOld === null ||
            (rawOld?.valueOf ? rawOld.valueOf() : rawOld) === 0; // optional: treat 0 as unset

        const oldMargin = rawOld?.valueOf ? rawOld.valueOf() : Number(rawOld);

        // Only enforce these rules if margin was already set
        if (!isUnset) {
            // Check if the variableMargin is the same as the current one
            if (oldMargin === newMargin) {
                return res.status(400).json({
                    success: false,
                    message: 'Variable Margin cannot be the same as the previous one.',
                });
            }

            // Check if the newMargin is greater than current one
            if (newMargin > oldMargin) {
                return res.status(400).json({
                    success: false,
                    message: 'Variable Margin cannot be increased.',
                });
            }
        }
        // Check if a bid has already been placed for the car
        const existingBid = await BidModel.findOne({ carId }).lean();

        if (!existingBid) {
            // If no bid exists, update the variableMargin in the cars collection
            await CarModel.findOneAndUpdate(
                { _id: carId },
                { $set: { variableMargin: newMargin } }
            );

            return res.status(200).json({
                success: true,
                message: 'Variable margin updated successfully.',
            });
        }


        const updatedCar = await CarModel.findOneAndUpdate(
            {
                _id: carId,
                $or: [
                    { variableMargin: { $exists: false } }, // field missing
                    { variableMargin: null },               // null
                    { variableMargin: 0 },                  // treat 0 as not set
                    { variableMargin: { $gt: newMargin } }, // only decrease
                ],
            },
            { $set: { fixedMargin: FIXED_MARGIN, variableMargin: newMargin } },
            { new: true, projection: { auctionStatus: 1, variableMargin: 1 } }
        ).lean();

        if (!updatedCar) {
            return res.status(400).json({
                success: false,
                message: 'Margin cannot be increased (or car not found).',
            });
        }


        if (updatedCar.auctionStatus === CONSTANTS.AUCTION_STATUS.UPCOMING || updatedCar.auctionStatus === CONSTANTS.AUCTION_STATUS.LIVE) {
            await setSystemBid(carId, userId, bidAmount, updatedCar.auctionStatus);

        } else if (updatedCar.auctionStatus === CONSTANTS.AUCTION_STATUS.OTOBUY) {
            setSystemOtobuyOffer(carId, userId, bidAmount);
        }


        // Tell all clients that variable margin changed
        const car = await CarModel.findById(carId).select('customerExpectedPrice variableMargin').lean();
        SocketService.broadcast(EVENTS.CUSTOMER_EXPECTED_PRICE_UPDATED, {
            carId,
            newCustomerExpectedPrice: parseFloat(car.customerExpectedPrice || 0),
            newVariableMargin: parseFloat(car.variableMargin || 0),
        });

        return res.status(200).json({
            success: true,
            message: 'Variable margin updated successfully.',
            auctionStatus: updatedCar.auctionStatus,
            variableMargin: updatedCar.variableMargin,
        });
    } catch (error) {
        console.error('setCarVariableMargin error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error: ' + error.message,
        });
    }
};



// --------- tiny helpers ---------
function buildSearchRegex(q) {
    if (!q) return null;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(escaped, 'i'); // case-insensitive contains
}


// ---------- helper to set system bid -------------
async function setSystemBid(carId, userId, bidAmount, auctionStatus) {
    // 🔹 get user's assigned KAM
    const user = await UserModel.findById(userId).select('assignedKam').lean();
    const kamId = user?.assignedKam || null;

    // Will show only to customer that a system bid has placed 
    const placedBid = await BidModel.create({ carId, userId, kamId, bidAmount: bidAmount, time: new Date(), via: 'manual', bidSection: auctionStatus, isSystemBid: true });

    SocketService.broadcast(EVENTS.SYSTEM_BID_PLACED, {
        carId, highestBid: bidAmount, time: new Date(), userId, via: 'manual',
        fixedMargin: placedBid.fixedMargin,   // ✅ from plugin
        variableMargin: placedBid.variableMargin, // ✅ from plugin
    });
}


async function setSystemOtobuyOffer(carId, userId, offerAmount) {
    // 🔹 get user's assigned KAM (if any)
    const user = await UserModel.findById(userId).select('assignedKam').lean();
    const kamId = user?.assignedKam || null;

    // Save offer record
    const placedOffer = await OtobuyOffersModel.create({
        carId: carId,
        userId,
        kamId,
        otobuyOffer: offerAmount,
        offerAt: Date.now(),
        isSystemOffer: true,
    });


    // Broadcast the new offer to all clients e.g. customer
    SocketService.broadcast(EVENTS.SYSTEM_OTOBUY_OFFER_PLACED, {
        carId: carId, newOfferAmmount: offerAmount,
        offerBy: userId, offerTime: new Date(),
        fixedMargin: placedOffer.fixedMargin,   // ✅ from plugin
        variableMargin: placedOffer.variableMargin, // ✅ from plugin 
    });
}