// /Agenda/Agenda Jobs/start-live-auction-job.js
'use strict';

const mongoose = require('mongoose');
const Car = require('../../Models/carModel');
const SocketService = require('../../Config/socket_service');
const EVENTS = require('../../Sockets/socket_events');
const CONSTANTS = require('../../Utils/constants');
const CarDetailsForCarsListModel = require('../../Shared/car_details_for_cars_list_model');
const { applyAuctionEndEffects } = require('../../Helper Functions/auction_end_helpers');
const { sendPushToExternalId, sendPushToAllDealers } = require('../../Helper Functions/send_notification_helpers');
const { getCustomerIdByPhoneNumber } = require('../../Helper Functions/external_id_extraction_helpers');
const { scheduleNotifyCustomerEverySixHoursIfCarIsLive } = require('./notify_customer_every_six_hours_if_car_is_live_job');
const { scheduleNotifyCustomer10MinsBeforeEndIfCarIsLive } = require('./notify_customer_10_mins_before_auction_end_if_car_is_live_job');


module.exports = (agenda) => {
    /**
     * (Optional) START job — ensures the car is LIVE at start time
     * and schedules the END job based on duration/end time.
     * Useful if you want a single “start” entry point. If you already flip in
     * move-car-to-live, you can skip scheduling this and only schedule END job.
     */
    agenda.define(
        CONSTANTS.AGENDA_JOBS.START_LIVE_AUCTION,
        { priority: 'high', concurrency: 50, lockLifetime: 120_000 },
        async (job, done) => {
            try {
                const { carId } = job.attrs.data || {};
                if (!carId || !mongoose.isValidObjectId(carId)) {
                    return done(new Error('Invalid or missing carId'));
                }

                const now = new Date();

                // Ensure car exists
                const car = await Car.findById(carId);
                if (!car) return done(); // nothing to do

                // If not live yet, make it live (idempotent)
                if (car.auctionStatus !== CONSTANTS.AUCTION_STATUS.LIVE) {
                    await Car.updateOne(
                        { _id: carId, auctionStatus: { $ne: CONSTANTS.AUCTION_STATUS.LIVE } },
                        {
                            $set: {
                                auctionStatus: CONSTANTS.AUCTION_STATUS.LIVE,
                                liveAt: now,
                                auctionStartTime: car.auctionStartTime || now,
                                auctionEndTime:
                                    car.auctionEndTime ||
                                    new Date((car.auctionStartTime || now).getTime() + (car.auctionDuration || 2) * 3600 * 1000),
                                upcomingUntil: now,
                            },
                        }
                    );

                    // emit updates (optional)
                    const fresh = await Car.findById(carId).lean();
                    const listing = CarDetailsForCarsListModel.setCarDetails(fresh);
                    // Remove from UPCOMING section when auction started
                    SocketService.emitToRoom(
                        EVENTS.UPCOMING_BIDS_SECTION_ROOM,
                        EVENTS.UPCOMING_BIDS_SECTION_UPDATED,
                        { action: 'removed', id: carId.toString(), car: listing, message: 'Car moved from UPCOMING to LIVE' }
                    );

                    // Remove from AUCTION ENDED section when auction started
                    SocketService.emitToRoom(
                        EVENTS.AUCTION_COMPLETED_CARS_SECTION_ROOM,
                        EVENTS.AUCTION_COMPLETED_CARS_SECTION_UPDATED,
                        { action: 'removed', id: carId.toString(), car: listing, message: 'Car moved from AUCTION ENDED to LIVE' }
                    );

                    // Add to LIVE section when auction started
                    SocketService.emitToRoom(
                        EVENTS.LIVE_BIDS_SECTION_ROOM,
                        EVENTS.LIVE_BIDS_SECTION_UPDATED,
                        { action: 'added', id: carId.toString(), car: listing, message: 'Car is now LIVE' }
                    );
                }

                // Schedule END job using stored end time
                const latest = await Car.findById(carId).lean();
                const endAt = latest?.auctionEndTime
                    ? new Date(latest.auctionEndTime)
                    : new Date((latest.auctionStartTime || now).getTime() + (latest.auctionDuration || 2) * 3600 * 1000);

                await module.exports.scheduleEndLiveAuction(agenda, carId, endAt);

                // Defense-in-depth: remove any duplicate START jobs for same car
                await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.START_LIVE_AUCTION, 'data.carId': carId.toString() });

                return done();
            } catch (err) {
                return done(err);
            }
        }
    );

    /**
     * END job — marks the auction as ended (idempotent).
     * Runs at auctionEndTime.
     */
    agenda.define(
        CONSTANTS.AGENDA_JOBS.END_LIVE_AUCTION,
        { priority: 'high', concurrency: 50, lockLifetime: 120_000 },
        async (job, done) => {
            try {
                const { carId } = job.attrs.data || {};
                if (!carId || !mongoose.isValidObjectId(carId)) {
                    return done(new Error('Invalid or missing carId'));
                }

                const now = new Date();

                // Atomic flip: only if still live // updating auction status to LIVEAUCTIONENDED
                const result = await Car.updateOne(
                    { _id: carId, auctionStatus: CONSTANTS.AUCTION_STATUS.LIVE },
                    {
                        $set: {
                            auctionStatus: CONSTANTS.AUCTION_STATUS.LIVEAUCTIONENDED, // e.g., 'auctionEnded'
                            auctionEndedAt: now,
                        },
                    }
                );

                if (result.modifiedCount === 1) {
                    // Broadcast UI changes
                    const updated = await Car.findById(carId).lean();
                    const listing = CarDetailsForCarsListModel.setCarDetails(updated);

                    // Remove from LIVE section when auction ended
                    SocketService.emitToRoom(
                        EVENTS.LIVE_BIDS_SECTION_ROOM,
                        EVENTS.LIVE_BIDS_SECTION_UPDATED,
                        { action: 'removed', id: carId.toString(), car: listing, message: 'Auction ended' }
                    );

                    // Add to auction ended section
                    SocketService.emitToRoom(
                        EVENTS.AUCTION_COMPLETED_CARS_SECTION_ROOM,
                        EVENTS.AUCTION_COMPLETED_CARS_SECTION_UPDATED,
                        { action: 'added', id: carId.toString(), car: listing, message: 'Car moved to ENDED' }
                    );

                    // 1) Send notification to customer when live auction ended and customer has not set CEP
                    const cep = Number(updated.customerExpectedPrice || 0);
                    if (!cep) {
                        const customerId = await getCustomerIdByPhoneNumber(updated.contactNumber);
                        if (customerId) {
                            await sendPushToExternalId({
                                externalId: customerId,
                                title: `Live Auction Closed`,
                                body: `Your car ${updated.make} ${updated.model} was not sold. Move your car to OtoBuy with your ask to sell instantaneously.`,
                                data: {},
                            });
                        } else {
                            console.warn(`[Push] No user found for car.contactNumber=${updated.contactNumber}. Skipping customer push.`);
                        }
                    }

                    // 2) Send notification to customer when live auction ended and expected price is not achieved
                    const highestBid = Number(updated.highestBid || 0);
                    if (cep > 0 && highestBid > 0 && cep > highestBid) {
                        const customerId = await getCustomerIdByPhoneNumber(updated.contactNumber);
                        if (customerId) {
                            await sendPushToExternalId({
                                externalId: customerId,
                                title: `The live auction for your car ${updated.make} ${updated.model} is over`,
                                body: `Move the car to OtoBuy with revised expected price to get best offers to sell your car.`,
                                data: {},
                            });
                        } else {
                            console.warn(`[Push] No user found for car.contactNumber=${updated.contactNumber}. Skipping customer push.`);
                        }
                    }


                    // 🔹 Apply the ported logic from the old job
                    await applyAuctionEndEffects(carId);

                    // Clean any stray END jobs for this car
                    await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.END_LIVE_AUCTION, 'data.carId': carId.toString() });
                }

                return done();
            } catch (err) {
                return done(err);
            }
        }
    );
};

/** Helper: schedule a unique START job at startAt */
module.exports.scheduleStartLiveAuction = async function scheduleStartLiveAuction(agenda, carId, startAt) {
    const job = agenda.create(CONSTANTS.AGENDA_JOBS.START_LIVE_AUCTION, { carId });
    job.unique({ name: CONSTANTS.AGENDA_JOBS.START_LIVE_AUCTION, 'data.carId': carId.toString() });
    job.schedule(startAt);
    await job.save();
    return job;
};

/** Helper: schedule a unique END job at endAt */
module.exports.scheduleEndLiveAuction = async function scheduleEndLiveAuction(agenda, carId, endAt) {
    const job = agenda.create(CONSTANTS.AGENDA_JOBS.END_LIVE_AUCTION, { carId });
    job.unique({ name: CONSTANTS.AGENDA_JOBS.END_LIVE_AUCTION, 'data.carId': carId.toString() });
    job.schedule(endAt);
    await job.save();

    // ✅ When job is scheduled announce to Live room (single place, no extra jobs)
    try {
        // Read fresh car
        const car = await Car.findById(carId).lean();

        // Send push notification to all users 
        await sendPushToAllDealers({
            title: 'Live Auction Started! 🚗',
            body: `${car.make} ${car.model} is now LIVE for bidding!`,
            data: {
                carId: car._id.toString(),
                screen: 'live', // directs user to Live Auctions tab
                navigateToScreen: CONSTANTS.NOTIFICATION_ROUTES.CAR_ADDED_IN_LIVE,
                parametersForScreen: {
                    carId: car._id.toString(),
                    currentOpenSection: CONSTANTS.HOME_SCREEN_SECTIONS.LIVE_BIDS_SECTION_SCREEN,
                }
            },
        });


        // Send notification to customer to inform that his car is live for bidding
        const customerId = await getCustomerIdByPhoneNumber(car.contactNumber);
        if (customerId) {
            await sendPushToExternalId({
                externalId: customerId,
                title: `Track bids now!`,
                body: `Your car ${car.make} ${car.model} is live in auction.`,
                data: {},
            });
        } else {
            console.warn(`[Push] No user found for car.contactNumber=${car.contactNumber}. Skipping customer push.`);
        }


        // Send notification to customer to ask him to set expected price if not already set
        if (car.customerExpectedPrice === null || car.customerExpectedPrice === undefined || car.customerExpectedPrice === 0) {
            if (customerId) {
                await sendPushToExternalId({
                    externalId: customerId,
                    title: `${car.make} ${car.model} is now LIVE for bidding!`,
                    body: `Please submit your expected price to get maximum participation`,
                    data: {},
                });
            } else {
                console.warn(`[Push] No user found for car.contactNumber=${car.contactNumber}. Skipping customer push.`);
            }
        }

        // Schedule notify customer every six hours if car is live
        try {
            await scheduleNotifyCustomerEverySixHoursIfCarIsLive(agenda, carId, customerId, car.liveAt, car.make, car.model);
        } catch (e) {
            console.error(`[START_LIVE_AUCTION] notify-6h schedule failed for carId=${carId}:`, e);
        }

        // Schedule notify customer 10 mins before end if car is live
        try {
            await scheduleNotifyCustomer10MinsBeforeEndIfCarIsLive(agenda, carId, customerId, car.auctionEndTime, car.make, car.model);
        } catch (e) {
            console.error(`[START_LIVE_AUCTION] 10-min notify schedule failed carId=${carId}:`, e);
        }






    } catch (_) { }

    return job;
};




