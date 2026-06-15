'use strict';

// /Agenda/Agenda Jobs/notify_customer_10_mins_before_auction_end_if_car_is_live_job.js

const mongoose = require('mongoose');
const Car = require('../../Models/carModel');
const CONSTANTS = require('../../Utils/constants');
const { sendPushToExternalId } = require('../../Helper Functions/send_notification_helpers');
const { getCustomerHighestBidAfterMarginAdjustment } = require('../../Helper Functions/margin_set_amount_helpers');

module.exports = (agenda) => {
    /**
     * Job: NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE
     * - Runs ONCE at (auctionEndTime - 10 minutes) per car
     * - If car is LIVE -> send push to customer
     * - Else (not live or missing) -> cancel job (defense-in-depth)
     */
    agenda.define(
        CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE,
        { priority: 'high', concurrency: 50, lockLifetime: 120_000 },
        async (job, done) => {
            try {
                const data = job.attrs.data || {};
                const carId = data.carId;
                const customerId = data.customerId;

                if (!carId || !mongoose.isValidObjectId(carId)) {
                    return done(new Error('Invalid or missing carId'));
                }

                // If customerId missing -> just cancel (no point running)
                if (!customerId) {
                    await agenda.cancel({
                        name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE,
                        'data.carId': carId.toString(),
                    });
                    return done();
                }

                // Fetch required fields
                // const car = await Car.findById(
                //     carId,
                //     { auctionStatus: 1, make: 1, model: 1 }
                // ).lean();
                const car = await Car.findById(
    carId,
    {
        auctionStatus: 1,
        make: 1,
        model: 1,
        highestBid: 1,
        fixedMargin: 1,
        variableMargin: 1,
    }
).lean();

                // If missing OR not LIVE -> cancel and exit
                if (!car || car.auctionStatus !== CONSTANTS.AUCTION_STATUS.LIVE) {
                    await agenda.cancel({
                        name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE,
                        'data.carId': carId.toString(),
                    });

                    console.log(
                        `[NOTIFY_10M] Auto-cancelled (car missing or not LIVE) carId=${carId}`
                    );
                    return done();
                }

                const makeStr = (data.make || car.make || '').toString();
                const modelStr = (data.model || car.model || '').toString();

                // Keep cached make/model updated (optional)
                if (data.make !== makeStr || data.model !== modelStr) {
                    job.attrs.data = { ...data, make: makeStr, model: modelStr };
                    await job.save();
                }

                // Highest bid formatting
                // const highestBidAfterMarginAdjustment = await getCustomerHighestBidAfterMarginAdjustment(carId);
                const highestBidAfterMarginAdjustment = getCustomerHighestBidAfterMarginAdjustment(car);
                const bidNum = Number(highestBidAfterMarginAdjustment || 0);
                const highestBidText = `₹${bidNum.toLocaleString('en-IN')}`;

                // ✅ Send push
                await sendPushToExternalId({
                    externalId: customerId,
                    title: 'Auction Closing in 10 Mins',
                    body: `Auction closing in 10 mins. Highest offer of ${highestBidText}, Revise expected price for better chances of closure`,
                    data: { carId: carId.toString() },
                });

                console.log(
                    `[NOTIFY_10M] Notification sent | carId=${carId} | ${makeStr} ${modelStr} | highestBid=${highestBidText} | customerId=${customerId}`
                );

                // Defense-in-depth: remove any stray duplicates
                await agenda.cancel({
                    name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE,
                    'data.carId': carId.toString(),
                });

                return done();
            } catch (err) {
                return done(err);
            }
        }
    );
};

/**
 * Helper: schedule ONCE at (auctionEndTime - 10 minutes)
 *
 * Usage:
 *   await scheduleNotifyCustomer10MinsBeforeEndIfCarIsLive(agenda, carId, customerId, car.auctionEndTime, car.make, car.model);
 */
module.exports.scheduleNotifyCustomer10MinsBeforeEndIfCarIsLive =
    async function scheduleNotifyCustomer10MinsBeforeEndIfCarIsLive(
        agenda,
        carId,
        customerId,
        auctionEndTime,
        make,
        model
    ) {
        if (!carId || !mongoose.isValidObjectId(carId)) {
            throw new Error('Invalid or missing carId');
        }

        if (!auctionEndTime) {
            throw new Error('auctionEndTime is required to schedule 10-min notification');
        }

        const endAt = new Date(auctionEndTime);
        const runAt = new Date(endAt.getTime() - 10 * 60 * 1000);

        // If endAt is too soon / already passed, schedule immediate run (optional)
        const when = runAt.getTime() > Date.now() ? runAt : new Date(Date.now() + 2_000);

        const payload = {
            carId: carId.toString(),
            customerId: customerId ? customerId.toString() : '',
            make: make ? make.toString() : '',
            model: model ? model.toString() : '',
        };

        const job = agenda.create(
            CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE,
            payload
        );

        // Unique per car
        job.unique({
            name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE,
            'data.carId': carId.toString(),
        });

        job.schedule(when);
        await job.save();
        return job;
    };
