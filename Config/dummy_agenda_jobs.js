// // utils/agendaJobs.js
// const Car = require('../Models/carModel');
// const User = require('../Models/userModel');
// const BidModel = require('../Models/bidModel');
// const socketService = require('../Config/socket_service');
// const CONSTANTS = require('../Utils/constants');
// const EVENTS = require('../Sockets/socket_events');
// const { deactivateAutoBidsForCar } = require('../Controllers/auction_controller');
// const NotificationsModel = require('../Models/userNotificationsModel');
// let agendaInstance = null;

// const defineJobs = (agenda) => {
//     agendaInstance = agenda; // store reference for scheduling

//     // Define job: end auction
//     agenda.define('end auction', async (job) => {
//         const { carId } = job.attrs.data;
//         // console.log(`[Agenda Job] Running 'end auction' for car ${carId}`);

//         try {
//             // Find car details
//             const car = await Car.findById(carId).lean();
//             // Find Winner details
//             const winner = await User.findById(car.highestBidder).select('userName').lean();
//             const winnerName = winner?.userName ?? '';

//             // Find bidders list
//             const biddersList = await BidModel.distinct('userId', { carId });

//             // Emit auction ended event
//             socketService.broadcast(EVENTS.AUCTION_ENDED, {
//                 carId: car._id.toString(),
//                 carName: `${car.make ?? ''} ${car.model ?? ''} ${car.variant ?? ''}`.trim(),
//                 bidAmount: car.highestBid,
//                 winnerId: car.highestBidder,
//                 winnerName,
//                 biddersList,
//                 message: '🎉 Auction ended. Winner declared!',
//             });

//             // 👉 Create notifications (winner + losers)
//             try {
//                 await createAuctionEndNotifications(car, biddersList);
//             } catch (e) {
//                 console.warn('createAuctionEndNotifications failed:', e.message);
//             }

//             // Tell the ui that cars list have been updated in live section
//             socketService.emitToRoom(EVENTS.LIVE_BIDS_SECTION_ROOM, EVENTS.LIVE_BIDS_SECTION_UPDATED, {
//                 action: 'removed',
//                 id: car._id.toString(),
//                 message: 'Car removed from live bids section',
//             });

//             // Update auction status 
//             await Car.updateOne(
//                 { _id: car._id },
//                 { $set: { auctionStatus: CONSTANTS.AUCTION_STATUS.LIVEAUCTIONENDED } }
//             );

//             // deactivate autobids
//             await deactivateAutoBidsForCar(carId);

//             console.log(`[Agenda Job] Auction ended for car ${carId}`);
//         } catch (err) {
//             console.error(`[Agenda Job] Error for car ${carId}:`, err.message);
//         }
//     });

//     console.log('[AgendaJobs] Jobs defined.');
// };

// const scheduleAuctionEnd = async (carId, endTime) => {
//     if (!agendaInstance) throw new Error('Agenda not initialized');
//     await agendaInstance.schedule(endTime, 'end auction', { carId });
//     console.log(`[AgendaJobs] Scheduled 'end auction' for car ${carId} at ${endTime}`);
// };

// // Export both job loader and scheduler methods
// module.exports = {
//     defineJobs,
//     scheduleAuctionEnd,
// };




// /** ---------- helper: create winner/loser notifications ---------- */
// async function createAuctionEndNotifications(car, biddersList) {
//     if (!car) return;
//     const carId = car._id?.toString();
//     const carName = `${car.make ?? ''} ${car.model ?? ''} ${car.variant ?? ''}`.trim();
//     const winnerId = car.highestBidder ? car.highestBidder.toString() : null;

//     // unique losers (all bidders except winner)
//     const uniqueBidders = [...new Set((biddersList || []).map(id => id?.toString()).filter(Boolean))];
//     const losers = winnerId ? uniqueBidders.filter(uid => uid !== winnerId) : uniqueBidders;

//     const amount = Number(car.highestBid || 0);
//     const formatted = amount.toLocaleString('en-IN');
//     const now = new Date();

//     const docs = [];
//     if (winnerId) {
//         docs.push({
//             userId: winnerId,
//             type: 'bid_won',
//             title: 'You won the auction 🎉',
//             body: `You won ${carName} for ₹${formatted}.`,
//             isRead: false,
//             createdAt: now,
//             data: { carId, carName, highestBid: amount, winnerId }, // keep/remove 'data' based on your schema
//         });
//     }
//     for (const uid of losers) {
//         docs.push({
//             userId: uid,
//             type: 'bid_lost',
//             title: 'Auction ended',
//             body: `You didn’t win ${carName}. Winning bid: ₹${formatted}.`,
//             isRead: false,
//             createdAt: now,
//             data: { carId, carName, highestBid: amount, winnerId },
//         });
//     }

//     if (!docs.length) return;

//     await NotificationsModel.insertMany(docs, { ordered: false });

   
// }
