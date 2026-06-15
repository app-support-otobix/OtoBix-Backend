// controllers/auctionController.js
const CarModel = require('../Models/carModel');
const SocketService = require('../Config/socket_service');
const CONSTANTS = require('../Utils/constants');
const EVENTS = require('../Sockets/socket_events');
const BidModel = require('../Models/bidModel');
const AutoBidModelForLiveSection = require('../Models/autoBidModelForLiveSection');
const { getAgenda } = require('../Agenda/agenda');
const { sendPushToExternalId } = require('../Helper Functions/send_notification_helpers');
const NotificationsModel = require('../Models/userNotificationsModel');
const UserModel = require('../Models/userModel');
const socketService = require('../Config/socket_service');
const { getCustomerIdByPhoneNumber } = require('../Helper Functions/external_id_extraction_helpers');
const { getCustomerHighestBidAfterMarginAdjustment } = require('../Helper Functions/margin_set_amount_helpers');

// ---- tiny per-process lock (serialize all writes per car) ----
const __carLocks = new Map(); // carId -> Promise chain
async function withCarLock(carId, fn) {
    const prev = __carLocks.get(carId) || Promise.resolve();
    let release;
    const p = new Promise((res) => (release = res));
    __carLocks.set(carId, prev.then(() => p));
    try {
        return await fn();
    } finally {
        release();
        if (__carLocks.get(carId) === p) __carLocks.delete(carId);
    }
}

const isLive = (status) => {
    const normalized = (status || '').toString().toLowerCase();
    return (
        normalized === CONSTANTS.AUCTION_STATUS.LIVE.toLowerCase() ||
        normalized === CONSTANTS.AUCTION_STATUS.UPCOMING.toLowerCase()
    );
};

const roundOffBidAmount = (n, roundOffTo = 1000) => Math.round(Number(n) / roundOffTo) * roundOffTo;



// ========== PUBLIC: manual bid ==========
async function updateBid(req, res) {
    try {
        const { carId, newBidAmount, userId, auctionSection } = req.body;
        if (!carId || !newBidAmount || !userId)
            return res.status(400).json({ error: 'carId, newBidAmount and userId are required' });

        const car = await CarModel.findById(carId).select('highestBid highestBidder auctionStatus auctionEndTime contactNumber');
        if (!car) return res.status(404).json({ error: 'Car not found' });
        if (!isLive(car.auctionStatus)) return res.status(400).json({ error: 'Auction not live or upcoming' });

        const current = Number(car.highestBid) || 0;
        // const incoming = Number(newBidAmount);
        const incoming = roundOffBidAmount(newBidAmount, 1000);  // <-- round to nearest 1000
        if (incoming <= current)
            return res.status(403).json({ error: 'Bid must be higher than current highest bid.' });


        // If 30 seconds are remaining in auction end time, extend auction by 2 minutes
        const endTime = new Date(car.auctionEndTime).getTime();
        const currentTime = new Date().getTime();
        const timeRemaining = endTime - currentTime; // minus endtime from current time

        if (timeRemaining < 30000) {
            const newEndTime = new Date(currentTime + 2 * 60 * 1000);
            await CarModel.updateOne({ _id: carId }, { $set: { auctionEndTime: newEndTime } });

            // Update the `nextRunAt` field in the existing Agenda job
            const agenda = getAgenda();
            await agenda.jobs({ name: CONSTANTS.AGENDA_JOBS.END_LIVE_AUCTION, 'data.carId': carId.toString() })
                .then((jobs) => {
                    if (jobs.length > 0) {
                        const job = jobs[0];  // Assuming there is only one job with this carId
                        job.schedule(newEndTime);  // Update the nextRunAt field to the new end time
                        job.save();  // Save the updated job
                    }
                });

            // Broadcast auction extended event
            SocketService.emitToRoom(
                EVENTS.LIVE_BIDS_SECTION_ROOM,
                EVENTS.AUCTION_EXTENDED,
                {
                    carId: carId.toString(),
                    newEndTime: newEndTime,
                }
            );
        }

        // Get previous highest bid and bidder
        const prevBid = current;
        const prevBidderId = car.highestBidder ? car.highestBidder.toString() : null;

        // CAS write
        const updated = await CarModel.findOneAndUpdate(
            { _id: carId, highestBid: current, auctionStatus: car.auctionStatus },
            { $set: { highestBid: incoming, highestBidder: userId } },
            { new: true }
        );
        if (!updated) return res.status(409).json({ error: 'Race condition: please retry' });

        // 🔔 notify the previous bidder 
        notifyOutbid({
            prevBidderId,
            prevBid,
            newBid: incoming,
            carId: carId.toString(),
            newBidderId: userId.toString(),
            auctionSection: auctionSection,
        });

        // ✅ Add car to user's my bids list
        await UserModel.updateOne(
            { _id: userId },
            { $addToSet: { myBids: carId } }
        );
        SocketService.emitToRoom(`${EVENTS.USER_ROOM}${userId}`, EVENTS.MY_BIDS_UPDATED, {
            action: 'add',
            carId: carId,
        });


        // 🔹 get user's assigned KAM
        const user = await UserModel.findById(userId).select('assignedKam').lean();
        const kamId = user?.assignedKam || null;

        const savedBid = await BidModel.create({ carId, userId, kamId, bidAmount: incoming, time: new Date(), via: 'manual', bidSection: auctionSection });

        SocketService.broadcast(EVENTS.BID_UPDATED, {
            carId, highestBid: incoming, time: new Date(), userId, via: 'manual',
            fixedMargin: savedBid.fixedMargin,   // ✅ from plugin
            variableMargin: savedBid.variableMargin, // ✅ from plugin
        });
        SocketService.emitToRoom(`car-${carId}`, EVENTS.BID_UPDATED, {
            carId, highestBid: incoming, time: new Date(), userId, via: 'manual',
            fixedMargin: savedBid.fixedMargin,   // ✅ from plugin
            variableMargin: savedBid.variableMargin, // ✅ from plugin 
        });

        // Resolve auto-bid wars
        await withCarLock(carId, async () => {
            await runAutoBidEngine(carId, auctionSection);
        });

        // Send notification to customer when a new bid is placed or final bid after auto bid racing
        const customerId = await getCustomerIdByPhoneNumber(car.contactNumber);
        if (customerId) {
            // const highestBidAfterMarginAdjustment = await getCustomerHighestBidAfterMarginAdjustment(carId);
            // const freshCar = await CarModel.findById(carId).select('make model').lean();
            const freshCar = await CarModel.findById(carId)
        .select('make model highestBid fixedMargin variableMargin')
        .lean();
    const highestBidAfterMarginAdjustment =
        getCustomerHighestBidAfterMarginAdjustment(freshCar);

            const notificationBody = highestBidAfterMarginAdjustment != null ?
                `New offer of ₹${highestBidAfterMarginAdjustment.toLocaleString('en-IN')}/- received on ${freshCar.make} ${freshCar.model}.` :
                `New offer received on ${freshCar.make} ${freshCar.model}.`;
            await sendPushToExternalId({
                externalId: customerId,
                title: 'New Bid Received',
                body: notificationBody,
                data: {},
            });
        } else {
            console.warn(`[Push] No user found for car.contactNumber=${car.contactNumber}. Skipping customer push.`);
        }


        return res.json({ success: true, highestBid: updated.highestBid });
    } catch (error) {
        console.error('Error updating bid:', error);
        res.status(500).json({ error: 'Failed to update bid' });
    }
}

// ========== PUBLIC: submit / update auto-bid ==========
async function submitAutoBidForLiveSection(req, res) {
    try {
        const { carId, userId, autoBidAmount, increment, auctionSection } = req.body;
        if (!carId || !userId || autoBidAmount == null)
            return res.status(400).json({ error: 'carId, userId, and autoBidAmount are required' });

        // const userMax = Number(autoBidAmount);
        const userMax = roundOffBidAmount(autoBidAmount, 1000);  // <-- round to nearest 1000
        const step = Number.isFinite(Number(increment)) && Number(increment) > 0 ? Math.floor(Number(increment)) : 1000;

        const car = await CarModel.findById(carId).select('highestBid highestBidder auctionStatus priceDiscovery');
        if (!car) return res.status(404).json({ error: 'Car not found' });
        if (!isLive(car.auctionStatus)) return res.status(400).json({ error: 'Auction not live' });

        const current = Number(car.highestBid) || 0;
        const minAcceptable = current + step;
        if (!Number.isFinite(userMax) || userMax < minAcceptable) {
            return res.status(400).json({ error: `Auto-bid must be at least Rs. ${minAcceptable.toLocaleString('en-IN')}/-` });
        }

        // 🔹 get user's assigned KAM once
        const user = await UserModel.findById(userId).select('assignedKam').lean();
        const kamId = user?.assignedKam || null;


        const autobid = await AutoBidModelForLiveSection.findOneAndUpdate(
            // { carId, userId },
            // { $set: { maxAmount: userMax, increment: step, isActive: true, bidSection: auctionSection }, $setOnInsert: { carId, userId } },
            { carId, userId },            // <-- FILTER GOES HERE
            [
                {
                    $set: {
                        // always keep these up to date
                        carId,               // safe to re-set to same value
                        userId,              // same
                        kamId,
                        maxAmount: userMax,
                        increment: step,
                        isActive: true,

                        // only set bidSection if it's currently missing or null
                        // bidSection: { $ifNull: ["$bidSection", auctionSection] },
                        bidSection: auctionSection 
                    }
                }
            ],
            {
                new: true, upsert: true, refreshMargins: true, // ✅ plugin will refresh margins
            }

        );

        // Optional immediate nudge by one step (don’t outbid yourself)
        await withCarLock(carId, async () => {
            const fresh = await CarModel.findById(carId).select('highestBid highestBidder auctionStatus priceDiscovery');
            if (!fresh || !isLive(fresh.auctionStatus)) return;

            const latestPrice = Number(fresh.highestBid) || 0;
            const pd = Number(fresh.priceDiscovery);
            const step = autobid.increment; // you already computed 'step' above

            let nextAmount;


            if (latestPrice === 0) {
                // ✅ First price set by auto-bid: 75% of priceDiscovery, capped by user's max
                if (!Number.isFinite(pd) || pd <= 0) {
                    // if priceDiscovery is missing/bad, fall back to one step
                    nextAmount = Math.min(userMax, step);
                } else {
                    const basePD75 = Math.floor(pd * 0.75);
                    const target = basePD75 + step;                        // “one thousand ahead of 75% of PD”
                    // Make sure we at least place a valid step-sized bid
                    nextAmount = Math.min(userMax, Math.max(step, target));
                }
            } else {
                // Normal nudge: current + step, capped by user's max
                nextAmount = Math.min(userMax, latestPrice + step);
            }

            const canOutbidNow =
                nextAmount > latestPrice &&
                (!fresh.highestBidder || fresh.highestBidder.toString() !== userId.toString());

            if (canOutbidNow) {
                // CAS write
                const prevBid = latestPrice;
                const prevBidderId = fresh.highestBidder ? fresh.highestBidder.toString() : null;

                // 🔹 get user's assigned KAM
                const user = await UserModel.findById(userId).select('assignedKam').lean();
                const kamId = user?.assignedKam || null;

                const updated = await CarModel.findOneAndUpdate(
                    { _id: carId, highestBid: latestPrice, auctionStatus: fresh.auctionStatus },
                    { $set: { highestBid: nextAmount, highestBidder: userId } },
                    { new: true }
                );
                if (updated) {
                    notifyOutbid({ prevBidderId, prevBid, newBid: nextAmount, carId: carId.toString(), newBidderId: userId.toString(), auctionSection: auctionSection, });
                    const savedBid = await BidModel.create({ carId, userId, kamId, bidAmount: nextAmount, time: new Date(), via: 'auto', bidSection: auctionSection, });
                    SocketService.broadcast(EVENTS.BID_UPDATED, {
                        carId, highestBid: nextAmount, time: new Date(), userId, via: 'auto',
                        fixedMargin: savedBid.fixedMargin,   // ✅ from plugin
                        variableMargin: savedBid.variableMargin, // ✅ from plugin 
                    });
                    SocketService.emitToRoom(`car-${carId}`, EVENTS.BID_UPDATED, {
                        carId, highestBid: nextAmount, time: new Date(), userId, via: 'auto',
                        fixedMargin: savedBid.fixedMargin,   // ✅ from plugin
                        variableMargin: savedBid.variableMargin, // ✅ from plugin 
                    });
                }
            }

            // ✅ Ensure final price is “second max + step”
            await runAutoBidEngine(carId, auctionSection);
        });

        return res.json({ success: true, message: 'Auto-bid saved', autobid });
    } catch (error) {
        console.error('Error in submitAutoBidForLiveSection:', error);
        return res.status(500).json({ error: 'Server error' });
    }
}

// ========== PRIVATE: proxy autobid engine ==========
async function runAutoBidEngine(carId, auctionSection) {
    let car = await CarModel.findById(carId).select('highestBid highestBidder auctionStatus');
    if (!car || !isLive(car.auctionStatus)) return;

    const current = Number(car.highestBid) || 0;
    const currentHighestBidder = car.highestBidder ? car.highestBidder.toString() : null;

    // 1) Load ALL auto-bids that can beat current (do NOT exclude current highest bidder)
    const autoBids = await AutoBidModelForLiveSection.find({
        carId,
        isActive: true,
        maxAmount: { $gt: current }
    }).lean();
    if (!autoBids.length) return;

    // Normalize increments
    autoBids.forEach(ab => {
        ab.increment = Number(ab.increment) > 0 ? Math.floor(Number(ab.increment)) : 1000;
    });

    // 2) Sort contenders by max desc; tie → earlier created wins
    autoBids.sort((a, b) => {
        if (b.maxAmount !== a.maxAmount) return b.maxAmount - a.maxAmount;
        // fallbacks if createdAt missing:
        const atA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const atB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return atA - atB;
    });

    // Winner and runner-up among ALL active autobids
    const top = autoBids[0];
    const second = autoBids[1] || null;

    // Use the winner's step to price (typical proxy-auction rule)
    const step = top.increment || 1000;

    // 3) Calculate the one-shot target
    //    - If only one autobidder exists, move current by one step (capped by their max)
    //    - If two+ autobidders, set price to min(top.max, max(current, second.max) + step)
    let target;
    if (!second) {
        target = Math.min(top.maxAmount, current + step);
    } else {
        target = Math.min(top.maxAmount, Math.max(current, second.maxAmount) + step);
    }

    if (!(target > current)) return; // already at equilibrium; nothing to do

    // Previous highest to notify (avoid self-notify guarded below)
    const prevBid = current;
    const prevBidderId = currentHighestBidder; // may be null


    // (A) Final-lose detection for prevHighest
    let forceNotify = false;
    if (prevBidderId) {
        const prevAuto = await AutoBidModelForLiveSection.findOne({
            carId,
            userId: prevBidderId,
            isActive: true,
        }).lean();
        if (prevAuto) {
            const prevStep = Number(prevAuto.increment) > 0 ? Math.floor(Number(prevAuto.increment)) : 1000;
            const prevMax = Number(prevAuto.maxAmount) || 0;
            // agar ab target par beat NAHI kar sakta → final loser
            if (prevMax < Number(target) + prevStep) {
                forceNotify = true;
            }
        }
    }

    // 4) Single CAS write to jump directly to target
    const updated = await CarModel.findOneAndUpdate(
        { _id: carId, highestBid: current, auctionStatus: car.auctionStatus },
        { $set: { highestBid: target, highestBidder: top.userId } },
        { new: true }
    );

    if (!updated) {
        // concurrent write → retry once under same logic
        return runAutoBidEngine(carId, auctionSection);
    }


    // ---- (1) Notify displaced previous-highest (manual/autobid both) ----
    if (prevBidderId && prevBidderId.toString() !== top.userId.toString()) {
        await notifyOutbid({
            prevBidderId: prevBidderId,
            prevBid,
            newBid: target,
            carId: carId.toString(),
            newBidderId: top.userId.toString(),
            auctionSection: auctionSection,
        }, { force: forceNotify });
    }


    // ---- Final-loss notify for true runner-up (covers case where prevHighest == winner due to nudge) ----
    if (second && second.userId && second.userId.toString() !== top.userId.toString()) {
        const secondStep = Number(second.increment) > 0 ? Math.floor(Number(second.increment)) : 1000;
        const secondMax = Number(second.maxAmount) || 0;
        // Can runner-up still beat new target by at least their step?
        const runnerCanBeat = secondMax >= (Number(target) + secondStep);
        if (!runnerCanBeat) {
            // avoid duplicate if prevHighest == runner-up
            if (!prevBidderId || second.userId.toString() !== prevBidderId.toString()) {
                await notifyOutbid({
                    prevBidderId: second.userId.toString(),
                    prevBid: current,
                    newBid: target,
                    carId: carId.toString(),
                    newBidderId: top.userId.toString(),
                    auctionSection: auctionSection,
                }, { force: true });
            }
        }
    }

    // 🔹 get user's assigned KAM
    const user = await UserModel.findById(top.userId).select('assignedKam').lean();
    const kamId = user?.assignedKam || null;

    const savedBid = await BidModel.create({
        carId,
        userId: top.userId,
        kamId,
        bidAmount: target,
        time: new Date(),
        via: 'auto',
        bidSection: auctionSection,
    });

    SocketService.broadcast(EVENTS.BID_UPDATED, {
        carId, highestBid: target, time: new Date(), userId: top.userId, via: 'auto',
        fixedMargin: savedBid.fixedMargin,   // ✅ from plugin
        variableMargin: savedBid.variableMargin, // ✅ from plugin 
    });
    SocketService.emitToRoom(`car-${carId}`, EVENTS.BID_UPDATED, {
        carId, highestBid: target, time: new Date(), userId: top.userId, via: 'auto',
        fixedMargin: savedBid.fixedMargin,   // ✅ from plugin
        variableMargin: savedBid.variableMargin, // ✅ from plugin 
    });

    // No loop here: equilibrium reached in one shot.
}


// ========== PUBLIC: utility for Agenda job ==========
async function deactivateAutoBidsForCar(carId) {
    await AutoBidModelForLiveSection.updateMany(
        { carId, isActive: true },
        { $set: { isActive: false } }
    );
}

//  ========= Outbid Helper =========
async function notifyOutbid({
    prevBidderId,             // string (ObjectId as string)
    prevBid,                  // number
    newBid,                   // number
    carId,                    // string (ObjectId as string)
    newBidderId,              // string
    auctionSection,           // string
}, options = {}) {
    const { force = false } = options;
    try {
        if (!prevBidderId) return;                  // nobody to notify
        if (prevBidderId === newBidderId) return;   // don't notify self-outbids


        // ✅ SUPPRESS mid-war — unless force === true
        if (!force) {
            const prevAuto = await AutoBidModelForLiveSection.findOne({
                carId,
                userId: prevBidderId,
                isActive: true,
            }).lean();
            if (prevAuto) {
                const step = Number(prevAuto.increment) > 0 ? Math.floor(Number(prevAuto.increment)) : 1000;
                const maxAmt = Number(prevAuto.maxAmount) || 0;
                // agar abhi next step se beat kar sakta hai to mid-war silence
                if (maxAmt >= Number(newBid) + step) {
                    return; // suppress
                }
            }
        }


        // Resolve car name if not provided by caller
        const carDisplayName = await getCarDisplayName(carId);

        // (optional) fetch names for a nicer message
        const [prevUser, newUser] = await Promise.all([
            UserModel.findById(prevBidderId).select('name').lean(),
            UserModel.findById(newBidderId).select('name').lean(),
        ]);

        // const newBidderName = newUser?.name || 'Another bidder';
        const newBidderName = 'Another bidder';
        const title = 'You’ve been outbid';
        const body = `${newBidderName} outbid you on ${carDisplayName} at Rs. ${Number(newBid).toLocaleString('en-IN')}/-`;
        const data = {
            type: 'OUTBID', carId, carName: carDisplayName, prevBid, newBid, newBidderId, body: body,
            navigateToScreen:
                auctionSection === CONSTANTS.HOME_SCREEN_SECTIONS.LIVE_BIDS_SECTION_SCREEN ?
                    CONSTANTS.NOTIFICATION_ROUTES.CAR_ADDED_IN_LIVE :
                    CONSTANTS.NOTIFICATION_ROUTES.CAR_ADDED_IN_UPCOMING,
            parametersForScreen: {
                carId: carId.toString(),
                currentOpenSection: auctionSection,
            }
        };

        // 1) Push notification (your current sender)
        await sendPushToExternalId({
            externalId: prevBidderId, // you said you use userId here
            title,
            body,
            data,
        });

        // 2) Create in-app notification
        const doc = await NotificationsModel.create({
            userId: prevBidderId,
            type: 'outbid_in_live_section',
            title,
            body,
            isRead: false,
            createdAt: new Date(),
            data,
            isGlobal: false,
        });

        // 3) Count unread notifications for badge indicator
        const unreadNotificationsCount = await NotificationsModel.countDocuments({
            userId: prevBidderId,
            isRead: false,
        });

        // 4) Emit real-time event to user’s notifications socket room
        socketService.emitToRoom(
            `${EVENTS.USER_NOTIFICATIONS_ROOM}${prevBidderId}`,
            EVENTS.USER_NOTIFICATION_CREATED,
            {
                item: {
                    _id: doc._id,
                    userId: doc.userId,
                    title: doc.title,
                    body: doc.body,
                    type: doc.type,
                    data: doc.data,
                    isRead: doc.isRead,
                    createdAt: doc.createdAt,
                },
                unreadNotificationsCount,
            }
        );

        // 3) (optional) persist in your in-app notifications collection
        // NotificationsModel.create({ userId: prevBidderId, title, body, data });

    } catch (err) {
        console.error('Failed to send outbid notification:', err);
    }
}


// Small helper function to get car display name
async function getCarDisplayName(carId) {
    const car = await CarModel.findById(carId)
        .select('make model variant')
        .lean();

    // Prefer explicit name/title; otherwise build "Year Make Model"
    const label = [car?.make, car?.model, car?.variant].filter(Boolean).join(' ').trim();

    return label || 'this car';
}



module.exports = {
    updateBid,
    submitAutoBidForLiveSection,
    deactivateAutoBidsForCar, // use in agenda “end auction”
};

