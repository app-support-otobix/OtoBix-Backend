'use strict';

// /Agenda/Agenda Jobs/notify_customer_every_six_hours_if_car_is_live_job.js

const mongoose = require('mongoose');
const Car = require('../../Models/carModel');
const CONSTANTS = require('../../Utils/constants');
const { sendPushToExternalId } = require('../../Helper Functions/send_notification_helpers');

module.exports = (agenda) => {
  /**
   * Job: NOTIFY_CUSTOMER_EVERY_SIX_HOURS_IF_CAR_IS_LIVE
   * - Runs every 6 hours PER CAR (first run exactly 6h after it goes LIVE)
   * - On each run:
   *    - if car is not LIVE (or missing) -> auto-cancel this job
   *    - else -> send push notification to the same customer
   * - Stores carId/customerId/make/model in job data
   */
  agenda.define(
    CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_EVERY_SIX_HOURS_IF_CAR_IS_LIVE,
    { priority: 'low', concurrency: 50, lockLifetime: 120_000 },
    async (job, done) => {
      try {
        const data = job.attrs.data || {};
        const carId = data.carId;
        const customerId = data.customerId;

        if (!carId || !mongoose.isValidObjectId(carId)) {
          return done(new Error('Invalid or missing carId'));
        }

        // Fetch only required fields
        const car = await Car.findById(
          carId,
          { auctionStatus: 1, make: 1, model: 1, liveAt: 1 }
        ).lean();

        // If car missing OR not LIVE -> auto-cancel this repeating job
        if (!car || car.auctionStatus !== CONSTANTS.AUCTION_STATUS.LIVE) {
          await agenda.cancel({
            name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_EVERY_SIX_HOURS_IF_CAR_IS_LIVE,
            'data.carId': carId.toString(),
          });

          console.log(
            `[NOTIFY_6H] Auto-cancelled job for carId=${carId} (car missing or not LIVE)`
          );
          return done();
        }

        // If customerId missing -> cancel (otherwise it will keep running doing nothing)
        if (!customerId) {
          console.warn(`[NOTIFY_6H] customerId missing. Auto-cancelling. carId=${carId}`);
          await agenda.cancel({
            name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_EVERY_SIX_HOURS_IF_CAR_IS_LIVE,
            'data.carId': carId.toString(),
          });
          return done();
        }

        // Keep make/model cached in job data (and refresh if DB values exist)
        const makeStr = (data.make || car.make || '').toString();
        const modelStr = (data.model || car.model || '').toString();

        if (data.make !== makeStr || data.model !== modelStr) {
          job.attrs.data = { ...data, make: makeStr, model: modelStr };
          await job.save();
        }

        // Optional: hours since live (nice for log)
        const base = car.liveAt ? new Date(car.liveAt) : null;
        const hoursLive = base
          ? Math.floor((Date.now() - base.getTime()) / (3600 * 1000))
          : null;

        // ✅ Send notification
        await sendPushToExternalId({
          externalId: customerId,
          title: 'Tip',
          body: `Revise your expected price for ${makeStr} ${modelStr} to attract more buyers.`,
          data: { carId: carId.toString() },
        });

        console.log(
          `[NOTIFY_6H] Notification sent | carId=${carId} | ${makeStr} ${modelStr} | hoursLive=${hoursLive ?? 'N/A'} | customerId=${customerId}`
        );

        return done();
      } catch (err) {
        return done(err);
      }
    }
  );
};

/**
 * Helper: schedule notify customer every 6 hours if car is LIVE
 * Usage (as you want):
 *   await scheduleNotifyCustomerEverySixHoursIfCarIsLive(agenda, carId, customerId, car.liveAt, car.make, car.model);
 *
 * - first run exactly +6h after liveAt
 * - then repeat every 6h
 * - unique per carId (no duplicates)
 */
module.exports.scheduleNotifyCustomerEverySixHoursIfCarIsLive =
  async function scheduleNotifyCustomerEverySixHoursIfCarIsLive(
    agenda,
    carId,
    customerId,
    liveAt,
    make,
    model
  ) {
    const liveDate = liveAt ? new Date(liveAt) : new Date();

    // first run exactly 6 hours after THIS car went live
    const firstRun = new Date(liveDate.getTime() + 6 * 3600 * 1000);

    const payload = {
      carId: carId.toString(),
      customerId: customerId ? customerId.toString() : '',
      make: make ? make.toString() : '',
      model: model ? model.toString() : '',
    };

    const job = agenda.create(
      CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_EVERY_SIX_HOURS_IF_CAR_IS_LIVE,
      payload
    );

    // Prevent duplicates for the same car
    job.unique({
      name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_EVERY_SIX_HOURS_IF_CAR_IS_LIVE,
      'data.carId': carId.toString(),
    });

    // Schedule first run + repeat
    job.schedule(firstRun);
    job.repeatEvery('6 hours', { skipImmediate: true });

    await job.save();
    return job;
  };
