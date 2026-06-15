// Admin/admin_bids_controller.js
const BidModel = require('../Models/bidModel');
const UserModel = require('../Models/userModel');
const CarModel = require('../Models/carModel');
const AutoBidModel = require('../Models/autoBidModelForLiveSection');
const OtobuyOfferModel = require('../Models/otobuyOffersModel');
const KamModel = require('../Models/kamsModel');
const mongoose = require('mongoose');

// Summary counts
exports.getBidsSummary = async (req, res) => {
    try {
        // UTC boundaries (you already had this)
        const now = new Date();
        const startOfUTCDate = (d) =>
            new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
        const startOfUTCWeek = (d) => {
            const day = (d.getUTCDay() + 6) % 7; // 0=Mon..6=Sun
            const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
            start.setUTCDate(start.getUTCDate() - day);
            return start;
        };
        const startOfUTCMonth = (d) =>
            new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));

        const startToday = startOfUTCDate(now);
        const startWeek = startOfUTCWeek(now);
        const startMonth = startOfUTCMonth(now);
        const endNow = now; // exclusive upper bound

        // Live vs Upcoming predicates (match your unified list logic)
        const IS_UPCOMING = { bidSection: 'upcoming' };
        const IS_LIVE = { $or: [{ bidSection: { $exists: false } }, { bidSection: { $ne: 'upcoming' } }] };

        const [
            totalBids,
            distinctBidders,
            todayBids,
            weekBids,
            monthBids,

            // NEW counters
            upcomingBids,
            liveBids,
            upcomingAutoBids,
            liveAutoBids,
            otobuyOffers,
        ] = await Promise.all([
            BidModel.countDocuments({}),
            BidModel.distinct('userId').then((arr) => arr.length),
            BidModel.countDocuments({ time: { $gte: startToday, $lt: endNow } }),
            BidModel.countDocuments({ time: { $gte: startWeek, $lt: endNow } }),
            BidModel.countDocuments({ time: { $gte: startMonth, $lt: endNow } }),

            // ---- NEW: five filter counts ----
            BidModel.countDocuments(IS_UPCOMING),         // upcomingBids
            BidModel.countDocuments(IS_LIVE),             // liveBids
            AutoBidModel.countDocuments(IS_UPCOMING),     // upcomingAutoBids
            AutoBidModel.countDocuments(IS_LIVE),         // liveAutoBids
            OtobuyOfferModel.countDocuments({}),          // otobuyOffers
        ]);

        return res.json({
            success: true,
            data: {
                totalBids,
                totalBidders: distinctBidders,
                todaysBids: todayBids,
                weeksBids: weekBids,
                monthsBids: monthBids,

                // NEW fields your Flutter model expects
                upcomingBids,
                liveBids,
                upcomingAutoBids,
                liveAutoBids,
                otobuyOffers,
            },
        });
    } catch (err) {
        console.error('getBidsSummary error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};



// Recent Bids List
const BID_FILTERS = Object.freeze({
    UPCOMING_BIDS: 'upcomingBids',
    LIVE_BIDS: 'liveBids',
    UPCOMING_AUTO_BIDS: 'upcomingAutoBids',
    LIVE_AUTO_BIDS: 'liveAutoBids',
    OTOBUY_OFFERS: 'otobuyOffers',
});

const TIME_RANGES = Object.freeze({
    TODAY: 'today',
    WEEK: 'week',
    MONTH: 'month',
    YEAR: 'year',
    ALL: 'all',
});

// ---------- small utils ----------
function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
}

function parsePageAndLimit(req) {
    const page = clamp(parseInt(req.query.page || '1', 10) || 1, 1, 1_000_000);
    const limit = clamp(parseInt(req.query.limit || '25', 10) || 25, 1, 200);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
}

function startOfUTCDate(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}
function startOfUTCWeek(d) {
    const day = (d.getUTCDay() + 6) % 7; // 0=Mon..6=Sun, Monday start
    const s = startOfUTCDate(d);
    s.setUTCDate(s.getUTCDate() - day);
    return s;
}
function startOfUTCMonth(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}
function startOfUTCYear(d) {
    return new Date(Date.UTC(d.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

function getRangeBounds(range) {
    const now = new Date();
    const r = String(range || TIME_RANGES.TODAY).toLowerCase();

    switch (r) {
        case TIME_RANGES.TODAY: return { start: startOfUTCDate(now), end: now };
        case TIME_RANGES.WEEK: return { start: startOfUTCWeek(now), end: now };
        case TIME_RANGES.MONTH: return { start: startOfUTCMonth(now), end: now };
        case TIME_RANGES.YEAR: return { start: startOfUTCYear(now), end: now };
        case TIME_RANGES.ALL:
        default: return { start: null, end: now };
    }
}

function pickUserName(u) {
    if (!u) return 'Unknown User';
    return u.userName || u.email || u.phone || 'Unknown User';
}


function pickCarName(c) {
    if (!c) return 'Unknown Car';

    // join make, model, variant with spaces, skipping any that are empty
    const name = [c.make, c.model, c.variant]
        .filter(Boolean)      // removes null/undefined/'' 
        .join(' ');           // e.g. "Toyota Corolla VXi"

    return name || 'Unknown Car';
}

async function loadUserAndCarMaps(docs) {
    const userIdsFromDocs = [
        ...new Set(
            docs
                .map(d => d.userId)
                .filter(Boolean)
                .map(String)
        ),
    ];

    const carIds = [
        ...new Set(
            docs
                .map(d => d.carId)
                .filter(Boolean)
                .map(String)
        ),
    ];

    // collect KAM ids from docs (unchanged)
    const kamIds = [
        ...new Set(
            docs
                .map(d => d.kamId)
                .filter(Boolean)
                .map(String)
        ),
    ];

    // 1) Load cars first (we need soldTo from them)
    const cars = carIds.length
        ? await CarModel.find({ _id: { $in: carIds } })
            .select('make model variant yearMonthOfManufacture appointmentId soldAt soldTo customerExpectedPrice highestBid fixedMargin variableMargin priceDiscovery')
            .lean()
        : [];

    // 2) From cars, collect extra userIds (buyers)
    const extraUserIdsFromCars = [
        ...new Set(
            cars
                .map(c => c.soldTo)
                .filter(Boolean)
                .map(id => String(id))
        ),
    ];

    // 3) Union all user ids (bidders + buyers)
    const allUserIds = [
        ...new Set([...userIdsFromDocs, ...extraUserIdsFromCars]),
    ];

    // 4) Load users + kams
    const [users, kams] = await Promise.all([
        allUserIds.length
            ? UserModel.find({ _id: { $in: allUserIds } })
                .select('userName email phone dealershipName')
                .lean()
            : [],
        kamIds.length
            ? KamModel.find({ _id: { $in: kamIds } })
                .select('name')
                .lean()
            : [],
    ]);

    const userMap = new Map(users.map(u => [String(u._id), u]));
    const carMap = new Map(cars.map(c => [String(c._id), c]));
    const kamMap = new Map(kams.map(k => [String(k._id), k]));

    return {
        userMap,
        carMap,
        kamMap,
    };
}


// ---------- per-filter metadata ----------
const META = {
    [BID_FILTERS.UPCOMING_BIDS]: {
        model: BidModel,
        sectionField: 'bidSection',
        timeField: 'time',
        amountField: 'bidAmount',
        isActiveField: 'isActive',
        fixedFilter: { bidSection: 'upcoming' },
        extraProject: () => ({}),
    },
    [BID_FILTERS.LIVE_BIDS]: {
        model: BidModel,
        sectionField: 'bidSection',
        timeField: 'time',
        amountField: 'bidAmount',
        isActiveField: 'isActive',
        fixedFilter: { $or: [{ bidSection: { $exists: false } }, { bidSection: { $ne: 'upcoming' } }] }, // anything which is not upcoming
        extraProject: () => ({}),
    },
    [BID_FILTERS.UPCOMING_AUTO_BIDS]: {
        model: AutoBidModel,
        sectionField: 'bidSection', // may or may not exist — you said it’s present here
        timeField: 'updatedAt',
        amountField: 'maxAmount',
        isActiveField: 'isActive',
        fixedFilter: { bidSection: 'upcoming' },
        extraProject: (d) => ({ increment: d.increment, maxAmount: d.maxAmount }),
    },
    [BID_FILTERS.LIVE_AUTO_BIDS]: {
        model: AutoBidModel,
        sectionField: 'bidSection',
        timeField: 'updatedAt',
        amountField: 'maxAmount',
        isActiveField: 'isActive',
        fixedFilter: { $or: [{ bidSection: { $exists: false } }, { bidSection: { $ne: 'upcoming' } }] }, // anything which is not upcoming
        extraProject: (d) => ({ increment: d.increment, maxAmount: d.maxAmount }),
    },
    [BID_FILTERS.OTOBUY_OFFERS]: {
        model: OtobuyOfferModel,
        sectionField: null,
        timeField: 'offerAt',
        amountField: 'otobuyOffer',
        isActiveField: null,
        fixedFilter: {}, // no upcoming/live split here
        extraProject: () => ({}),
    },
};

// ---------- main function ----------
exports.getRecentBidsList = async (req, res) => {


    try {
        const { page, limit, skip } = parsePageAndLimit(req);

        const type = String(req.query.type || BID_FILTERS.LIVE_BIDS);
        const range = String(req.query.range || TIME_RANGES.TODAY);

        // 🔍 NEW: read search text from query
        const searchRaw = (req.query.search || '').toString().trim();
        const searchRegex = buildSearchRegex(searchRaw);

        const meta = META[type];
        if (!meta) {
            return res.status(400).json({
                error: `Invalid type. Allowed: ${Object.values(BID_FILTERS).join(', ')}`,
            });
        }

        const { start, end } = getRangeBounds(range);

        // Build query filter
        const filter = { ...(meta.fixedFilter || {}) };

        // ⬇️ Only apply time range when there is NO search
        if (!searchRegex && start) {
            filter[meta.timeField] = { $gte: start, $lt: end };
        }


        // 🔍 NEW: if search given, filter by Car.appointmentId
        if (searchRegex) {
            // find cars whose appointmentId matches search
            const carIds = await CarModel.find({
                appointmentId: { $regex: searchRegex },
            }).distinct('_id');

            if (!carIds.length) {
                // no matching cars → no matching bids/autobids/offers
                const emptyPagination = {
                    page,
                    limit,
                    total: 0,
                    totalPages: 1,
                    hasNext: false,
                    hasPrev: page > 1,
                };

                return res.json({
                    success: true,
                    data: {
                        bids: [],
                        pagination: emptyPagination,
                    },
                });
            }

            // only load docs linked to these cars
            filter.carId = { $in: carIds };
        }

        // Sort: latest first by time, then _id
        const sort = { [meta.timeField]: -1, _id: -1 };

        // Query + count
        const [docs, total] = await Promise.all([
            meta.model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
            meta.model.countDocuments(filter),
        ]);

        if (!docs.length) {
            return res.json({
                success: true,
                data: {
                    bids: [],
                    pagination: {
                        page, limit, total,
                        totalPages: Math.max(1, Math.ceil(total / limit)),
                        hasNext: false,
                        hasPrev: page > 1,
                    },
                },
            });
        }

        // hydrate user + car for display
        const { userMap, carMap, kamMap } = await loadUserAndCarMaps(docs);

        // Normalize to ONE shape the Flutter table already expects
        const rows = docs.map((d) => {
            const user = userMap.get(String(d.userId));
            const car = carMap.get(String(d.carId));

            const bidAmount = Number(d[meta.amountField] ?? 0);
            const time = d[meta.timeField] || d.createdAt || d.updatedAt || null;

            const isActive = meta.isActiveField
                ? Boolean(d[meta.isActiveField])
                : false;

            // 🔹 Resolve KAM name
            let assignedKamName = 'No KAM Assigned';
            if (d.kamId) {
                const kamId = String(d.kamId);
                const kam = kamMap.get(kamId);
                if (kam && kam.name) {
                    assignedKamName = kam.name;
                }
            }

            // 🔹 Sold info — only really meaningful for OTOBUY_OFFERS
            let soldAt = 0;
            let soldToName = '';

            if (type === BID_FILTERS.OTOBUY_OFFERS && car) {
                soldAt = Number(car.soldAt || 0);
                if (car.soldTo) {
                    const buyer = userMap.get(String(car.soldTo));
                    soldToName = pickUserName(buyer);
                }
            }

            const customerExpectedPrice = car ? Number(car.customerExpectedPrice?.valueOf?.() ?? car.customerExpectedPrice) || 0 : 0;
            const highestBid = car ? Number(car.highestBid?.valueOf?.() ?? car.highestBid) || 0 : 0;
            const fixedMargin = car ? Number(car.fixedMargin?.valueOf?.() ?? car.fixedMargin) || 0 : 0;
            const variableMargin = car ? Number(car.variableMargin?.valueOf?.() ?? car.variableMargin) || 0 : 0;
            const priceDiscovery = car ? Number(car.priceDiscovery?.valueOf?.() ?? car.priceDiscovery) || 0 : 0;

            const bidFixedMargin = Number(d.fixedMargin?.valueOf?.() ?? d.fixedMargin) || 0;
            const bidVariableMargin = Number(d.variableMargin?.valueOf?.() ?? d.variableMargin) || 0;



            return {
                id: String(d._id),
                carId: String(d.carId ?? ''),
                userName: pickUserName(user),
                dealershipName: (user && user.dealershipName) ? user.dealershipName : 'Unknown dealership name',
                assignedKam: assignedKamName,
                car: pickCarName(car),
                appointmentId: (car && car.appointmentId) ? String(car.appointmentId) : 'Unknown appointment ID',
                bidAmount,
                time,
                isActive,
                source: type,
                meta: meta.extraProject(d),

                // 👇 NEW fields for UI
                soldAt,
                soldToName,

                customerExpectedPrice,
                highestBid,
                fixedMargin,
                variableMargin,
                priceDiscovery,

                bidFixedMargin,
                bidVariableMargin,
            };
        });


        const totalPages = Math.max(1, Math.ceil(total / limit));
        const hasNext = page < totalPages;
        const hasPrev = page > 1;

        return res.json({
            success: true,
            data: {
                bids: rows,
                pagination: { page, limit, total, totalPages, hasNext, hasPrev },
            },
        });
    } catch (err) {
        console.error('getUnifiedBidsList error:', err);
        res.status(500).json({ error: 'Server error' });
    }
};

// --------- tiny helpers ---------
function buildSearchRegex(q) {
    if (!q) return null;
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape regex specials
    return new RegExp(escaped, 'i'); // case-insensitive contains
}




// ======================= Delete all bids =======================
exports.deleteAllBids = async (req, res) => {
    try {
      const { carId } = req.body;

      if (!carId) {
        return res.status(400).json({
          success: false,
          message: "carId is required",
        });
      }
      
      if (!mongoose.isValidObjectId(carId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid carId",
      });
    }

    // 1️⃣ Delete bids
    const bidsDeleteResult = await BidModel.deleteMany({
      carId: carId,
    });

    // 2️⃣ Delete auto bids
    const autoBidsDeleteResult = await AutoBidModel.deleteMany({
      carId: carId,
    });

    // 3️⃣ Update car
    const carUpdateResult = await CarModel.updateOne(
      { _id: carId },
      {
        $set: {
          highestBid: 0,
          highestBidder: "",
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "All bids deleted and car reset successfully",
      data: {
        bidsDeleted: bidsDeleteResult.deletedCount,
        autoBidsDeleted: autoBidsDeleteResult.deletedCount,
        carUpdated: carUpdateResult.modifiedCount,
      },
    });

  } catch (err) {
    console.error("Error in deleteAllBids:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
      error: err.message,
    });
  }
};



exports.deleteSingleBid = async (req, res) => {
  try {
    const { bidId } = req.body;

    if (!bidId) {
      return res.status(400).json({
        success: false,
        message: "bidId is required",
      });
    }

    if (!mongoose.isValidObjectId(bidId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid bidId",
      });
    }

    // 1️⃣ Find the bid
    const bid = await BidModel.findById(bidId);
    if (!bid) {
      return res.status(404).json({
        success: false,
        message: "Bid not found",
      });
    }

    const carId = bid.carId.toString();

    // 2️⃣ Get car
    const car = await CarModel.findById(carId);
    if (!car) {
      return res.status(404).json({
        success: false,
        message: "Car not found",
      });
    }

    const isHighestBidSame =
      car.highestBid === bid.bidAmount &&
      car.highestBidder === bid.userId;

    // =========================
    // CASE 1: NOT highest bid
    // =========================
    if (!isHighestBidSame) {
      await BidModel.deleteOne({ _id: bidId });

      return res.status(200).json({
        success: true,
        message: "Bid deleted (was not highest)",
      });
    }

    // =========================
    // CASE 2: IS highest bid
    // =========================

    // Find previous highest bid (excluding current one)
    const previousBid = await BidModel.findOne({
      carId: carId,
      _id: { $ne: bidId },    
    })
      .sort({ bidAmount: -1, createdAt: -1 }) // highest first
      .lean();

    if (previousBid) {
      // Update car with previous bid
      await CarModel.updateOne(
        { _id: carId },
        {
          $set: {
            highestBid: previousBid.bidAmount,
            highestBidder: previousBid.userId,
          },
        }
      );
    } else {
      // No previous bids → reset
      await CarModel.updateOne(
        { _id: carId },
        {
          $set: {
            highestBid: 0,
            highestBidder: "",
          },
        }
      );
    }

    // Delete current bid
    await BidModel.deleteOne({ _id: bidId });

    return res.status(200).json({
      success: true,
      message: "Highest bid deleted and fallback applied",
      data: {
        newHighestBid: previousBid ? previousBid.bidAmount : 0,
        newHighestBidder: previousBid ? previousBid.userId : "",
      },
    });

  } catch (err) {
    console.error("Error in deleteSingleBid:", err.message);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
};