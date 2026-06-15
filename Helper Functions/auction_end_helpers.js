'use strict';

const mongoose = require('mongoose');
const Car = require('../Models/carModel');
const User = require('../Models/userModel');
const BidModel = require('../Models/bidModel');
const socketService = require('../Config/socket_service');
const EVENTS = require('../Sockets/socket_events');
const { deactivateAutoBidsForCar } = require('../Controllers/auction_controller');
const NotificationsModel = require('../Models/userNotificationsModel');
const CONSTANTS = require('../Utils/constants');
const { sendPushToExternalId } = require('../Helper Functions/send_notification_helpers');

/**
 * Helper #1: Create winner/loser notifications
 * Re-usable, accepts the car doc (lean or normal) and bidders list.
 */
async function createAuctionEndNotifications(car, biddersList) {
    if (!car) return;

    const carId = car._id?.toString();
    const carName = `${car.make ?? ''} ${car.model ?? ''} ${car.variant ?? ''}`.trim();
    const winnerId = car.highestBidder ? car.highestBidder.toString() : null;

    // unique losers (all bidders except winner)
    const uniqueBidders = [...new Set((biddersList || []).map(id => id?.toString()).filter(Boolean))];
    const losers = winnerId ? uniqueBidders.filter(uid => uid !== winnerId) : uniqueBidders;

    const amount = Number(car.highestBid || 0);
    const formatted = amount.toLocaleString('en-IN');
    const now = new Date();

    const docs = [];
    if (winnerId) {
        docs.push({
            userId: winnerId,
            type: 'bid_won',
            title: 'You won the auction 🎉',
            body: `You won ${carName} for ₹${formatted}.`,
            isRead: false,
            createdAt: now,
            data: { carId, carName, highestBid: amount, winnerId },
        });
    }
    for (const uid of losers) {
        docs.push({
            userId: uid,
            type: 'bid_lost',
            title: 'Auction ended',
            body: `You didn’t win ${carName}. Winning bid: ₹${formatted}.`,
            isRead: false,
            createdAt: now,
            data: { carId, carName, highestBid: amount, winnerId },
        });
    }

    if (!docs.length) return;

    // ordered:false => keep going even if some users are missing/deleted
    // 1️⃣ Save all notifications
    const insertedDocs = await NotificationsModel.insertMany(docs, { ordered: false });

    // Send push notifications (fire & forget per user)
    // for (const n of docs) {
    //     try {
    //         await sendPushToExternalId({
    //             externalId: n.userId,
    //             title: n.title,
    //             body: n.body,
    //             data: n.data,
    //         });
    //     } catch (err) {
    //         console.warn('[Push] failed for user', n.userId, err?.response?.data || err.message);
    //     }
    // }

    // 2️⃣ Send push notifications (fire & forget)
    for (const n of insertedDocs) {
        try {
            await sendPushToExternalId({
                externalId: n.userId.toString(),
                title: n.title,
                body: n.body,
                data: n.data,
            });
        } catch (err) {
            console.warn('[Push] failed for user', n.userId, err?.response?.data || err.message);
        }
    }

    // 3️⃣ Emit socket notifications to each affected user
    for (const doc of insertedDocs) {
        try {
            const unreadCount = await NotificationsModel.countDocuments({
                userId: doc.userId,
                isRead: false,
            });

            socketService.emitToRoom(
                `${EVENTS.USER_NOTIFICATIONS_ROOM}${doc.userId}`,
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
                    unreadNotificationsCount: unreadCount,
                }
            );
        } catch (err) {
            console.warn('[Socket emit failed] user:', doc.userId, err.message);
        }
    }
}

/**
 * Helper #2: Apply post-end effects (except status flip & LIVE-section removal).
 * - Fetch car
 * - Determine winner name and bidders list
 * - Broadcast AUCTION_ENDED
 * - Create notifications (winner + losers)
 * - Deactivate autobids for this car
 *
 * Idempotency: You can optionally persist an `auctionFinalizedAt` on the Car
 * and only run if it's empty. For now we just run once from END job after a successful flip.
 */
async function applyAuctionEndEffects(carId) {
    if (!carId || !mongoose.isValidObjectId(carId)) return;

    // Load car (lean for perf)
    const car = await Car.findById(carId).lean();
    if (!car || car.auctionStatus !== CONSTANTS.AUCTION_STATUS.LIVEAUCTIONENDED) return;

    // Winner details (optional)
    let winnerName = '';
    if (car.highestBidder) {
        const winner = await User.findById(car.highestBidder).select('userName').lean();
        winnerName = winner?.userName ?? '';
    }

    // All unique bidders for this car
    const biddersList = await BidModel.distinct('userId', { carId });

    // Broadcast detailed AUCTION_ENDED event to everyone
    socketService.broadcast(EVENTS.AUCTION_ENDED, {
        carId: car._id.toString(),
        carName: `${car.make ?? ''} ${car.model ?? ''} ${car.variant ?? ''}`.trim(),
        bidAmount: car.highestBid,
        winnerId: car.highestBidder,
        winnerName,
        registrationYear: car?.registrationDate ? new Date(car.registrationDate).getFullYear() : '',
        biddersList,
        message: '🎉 Auction ended. Winner declared!',
    });


    // NEW: generic push to ALL bidders
    try {
        await sendPushNotificationToAllBidders(car, biddersList);
    } catch (e) {
        console.warn('[applyAuctionEndEffects] sendPushNotificationToAllBidders failed:', e.message);
    }

    // Deactivate bids in the Bid collection
    await BidModel.updateMany({ carId, isActive: true }, { $set: { isActive: false } });

    // Notifications (winner + losers)
    try {
        await createAuctionEndNotifications(car, biddersList);
    } catch (e) {
        console.warn('[applyAuctionEndEffects] createAuctionEndNotifications failed:', e.message);
    }

    // Turn off autobids for this car
    try {
        await deactivateAutoBidsForCar(carId);
    } catch (e) {
        console.warn('[applyAuctionEndEffects] deactivateAutoBidsForCar failed:', e.message);
    }
}

/**
 * Helper #3: Push a generic "auction ended" notification to ALL bidders of a car.
 * - Uses a single, neutral message for everyone (winner + losers).
 * - Safe against duplicates and nulls.
 */
async function sendPushNotificationToAllBidders(car, biddersList) {
    if (!car) return;

    const carId = car._id?.toString();
    const carName = `${car.make ?? ''} ${car.model ?? ''} ${car.variant ?? ''}`.trim();
    const amount = Number(car.highestBid || 0);
    const formatted = amount.toLocaleString('en-IN');

    // Unique userIds as strings
    const uniqueBidders = [...new Set((biddersList || [])
        .map(id => id?.toString())
        .filter(Boolean))];

    const payloads = uniqueBidders.map(uid => ({
        externalId: uid,
        title: 'Auction ended',
        body: `Auction ended for ${carName}. Winning bid is Rs. ${formatted}/-.`,
        data: { carId, carName, highestBid: amount },
    }));

    // Fire all in parallel but don’t fail the whole flow on individual errors
    await Promise.allSettled(
        payloads.map(p =>
            sendPushToExternalId(p).catch(err => {
                console.warn('[Push] failed for user', p.externalId, err?.response?.data || err.message);
            })
        )
    );
}


module.exports = {
    createAuctionEndNotifications,
    applyAuctionEndEffects,
};
