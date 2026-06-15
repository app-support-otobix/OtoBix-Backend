// Agenda Jobs/schedule_auction_end_time_for_update_auction_time_api.js
const Car = require('../../Models/carModel');
const User = require('../../Models/userModel');
const BidModel = require('../../Models/bidModel');
const socketService = require('../../Config/socket_service');
const CONSTANTS = require('../../Utils/constants');
const EVENTS = require('../../Sockets/socket_events');
const { deactivateAutoBidsForCar } = require('../../Controllers/auction_controller');
const NotificationsModel = require('../../Models/userNotificationsModel');

let agendaInstance = null;

// 1) Define jobs (called by the loader with the agenda instance)
function defineJobs(agenda) {
    agendaInstance = agenda;

    agenda.define('end auction', async (job) => {
        const { carId } = job.attrs.data;
        try {
            const car = await Car.findById(carId).lean();
            const winner = car?.highestBidder
                ? await User.findById(car.highestBidder).select('userName').lean()
                : null;

            const biddersList = await BidModel.distinct('userId', { carId });

            socketService.broadcast(EVENTS.AUCTION_ENDED, {
                carId: car._id.toString(),
                carName: `${car.make ?? ''} ${car.model ?? ''} ${car.variant ?? ''}`.trim(),
                bidAmount: car.highestBid,
                winnerId: car.highestBidder,
                winnerName: winner?.userName ?? '',
                registrationYear: car?.registrationDate ? new Date(car.registrationDate).getFullYear() : '',
                biddersList,
                message: '🎉 Auction ended. Winner declared!',
            });

            try {
                await createAuctionEndNotifications(car, biddersList);
            } catch (e) {
                console.warn('createAuctionEndNotifications failed:', e.message);
            }

            socketService.emitToRoom(
                EVENTS.LIVE_BIDS_SECTION_ROOM,
                EVENTS.LIVE_BIDS_SECTION_UPDATED,
                {
                    action: 'removed',
                    id: car._id.toString(),
                    message: 'Car removed from live bids section',
                }
            );

            await Car.updateOne(
                { _id: car._id },
                { $set: { auctionStatus: CONSTANTS.AUCTION_STATUS.LIVEAUCTIONENDED } }
            );

            await deactivateAutoBidsForCar(carId);

            console.log(`[Agenda Job] Auction ended for car ${carId}`);
        } catch (err) {
            console.error(`[Agenda Job] Error for car ${carId}:`, err.message);
        }
    });

    console.log('[AgendaJobs] Jobs defined.');
}

// 2) Scheduler API you call elsewhere
async function scheduleAuctionEndForUpdateAuctionTimeApi(carId, endTime) {
    if (!agendaInstance) throw new Error('Agenda not initialized');
    await agendaInstance.schedule(endTime, 'end auction', { carId });
    console.log(`[AgendaJobs] Scheduled 'end auction' for car ${carId} at ${endTime}`);
}

// 3) Export a *function* for the loader, and attach the scheduler as a property
function loader(agenda) {
    defineJobs(agenda);
}
module.exports = loader;
module.exports.scheduleAuctionEndForUpdateAuctionTimeApi =
    scheduleAuctionEndForUpdateAuctionTimeApi;

// ---------- helpers ----------
async function createAuctionEndNotifications(car, biddersList) {
    if (!car) return;
    const carId = car._id?.toString();
    const carName = `${car.make ?? ''} ${car.model ?? ''} ${car.variant ?? ''}`.trim();
    const winnerId = car.highestBidder ? car.highestBidder.toString() : null;

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

    if (docs.length) {
        await NotificationsModel.insertMany(docs, { ordered: false });
    }
}
