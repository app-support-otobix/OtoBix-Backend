// Agenda/Agenda Jobs/schedule_self_inspected_car_auction_job.js
const mongoose = require('mongoose');
const SelfInspectedCarModel = require('../../Models/selfInspectedCarsModel');
const SocketService = require('../../Config/socket_service');
const CONSTANTS = require('../../Utils/constants');
const EVENTS = require('../../Sockets/socket_events');
const { sendPushToExternalId, sendPushToAllDealers } = require('../../Helper Functions/send_notification_helpers');
const { getUserIdByPhoneNumber } = require('../../Helper Functions/external_id_extraction_helpers');

/**
 * Job: schedule-self-inspected-car-auction
 * - Runs ONCE at its scheduled time.
 * - Uniqueness key: (job name + carId) so the same car cannot be scheduled twice.
 * - Idempotent DB update: flips only if still 'liveForBidding'.
 * - This will run when scheduled time come.
 */
module.exports = (agenda) => {
  agenda.define(
    CONSTANTS.AGENDA_JOBS.SCHEDULE_SELF_INSPECTED_CAR_AUCTION,
    { priority: 'high', concurrency: 50, lockLifetime: 30_000 },
    async (job, done) => {
      try {
        const { carId } = job.attrs.data || {};
        if (!carId || !mongoose.isValidObjectId(carId)) {
          return done(new Error('Invalid or missing carId'));
        }

        // Atomic one-time flip. If already flipped, modifiedCount = 0.
        const result = await SelfInspectedCarModel.updateOne(
          { _id: carId, auctionStatus: CONSTANTS.SELF_INSPECTED_CARS_AUCTION_STATUS.LIVE_FOR_BIDDING },
          {
            $set: { auctionStatus: CONSTANTS.SELF_INSPECTED_CARS_AUCTION_STATUS.BIDDING_ENDED },
          }
        );

        // If car is moved from liveForBidding to biddingEnded
        if (result.modifiedCount === 1) {

          // Fetch updated doc
          const updated = await SelfInspectedCarModel.findById(carId).lean();

          // Remove from PD section when auction ended
          SocketService.emitToRoom(
            EVENTS.PD_SECTION_ROOM, EVENTS.PD_SECTION_UPDATED,
            { action: 'removed', id: carId.toString(), message: 'Car removed from PD' }
          );

          // Cleanup (defense-in-depth): remove any stray future jobs for same car
          await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.SCHEDULE_SELF_INSPECTED_CAR_AUCTION, 'data.carId': carId.toString() });
        }

        return done();
      } catch (err) {
        return done(err);
      }
    }
  );
};





// This is run when job is scheduled means in start.
module.exports.scheduleSelfInspectedCarAuction = async function scheduleSelfInspectedCarAuction(
  agenda, carId, when // Date or parsable string
) {

  const job = agenda.create(CONSTANTS.AGENDA_JOBS.SCHEDULE_SELF_INSPECTED_CAR_AUCTION, { carId: carId.toString() });

  // Uniqueness: prevent duplicate jobs for the same car
  job.unique({ name: CONSTANTS.AGENDA_JOBS.SCHEDULE_SELF_INSPECTED_CAR_AUCTION, 'data.carId': carId.toString() });



  job.schedule(when);
  await job.save();



  // ✅ When job is scheduled announce to PD room that this car is added in pd
  try {
    const selfInspectedCar = await SelfInspectedCarModel.findById(carId).lean();

    // Only announce if it’s really marked liveForBidding right now
    if (selfInspectedCar && selfInspectedCar.auctionStatus === CONSTANTS.SELF_INSPECTED_CARS_AUCTION_STATUS.LIVE_FOR_BIDDING) {

      SocketService.emitToRoom(
        EVENTS.PD_SECTION_ROOM, EVENTS.PD_SECTION_UPDATED,
        {
          action: 'added',                 
          id: carId.toString(),
          car: selfInspectedCar,
          auctionEndTime: selfInspectedCar.auctionEndTime,
          message: 'Car added to PD',
        }
      );

      // Send push notification to all users
      await sendPushToAllDealers({
        title: 'New Car in PD 🚗',
        body: `${selfInspectedCar.make} ${selfInspectedCar.model} is now available in PD!`,
        data: {
          carId: selfInspectedCar._id.toString(),
          screen: 'pd',
          navigateToScreen: CONSTANTS.NOTIFICATION_ROUTES.CAR_ADDED_IN_PD,
          parametersForScreen: {
            carId: selfInspectedCar._id.toString(),
            currentOpenSection: CONSTANTS.HOME_SCREEN_SECTIONS.PD_SECTION_SCREEN,
          }
        },
      });

      // Notify dealer (seller) that his car is in PD
      const dealerAsSellerId = await getUserIdByPhoneNumber(selfInspectedCar.sellerContactNumber);
      if (dealerAsSellerId) {
        await sendPushToExternalId({
          externalId: dealerAsSellerId,
          title: `${selfInspectedCar.make} ${selfInspectedCar.model} is now in PD`,
          body: `Set your expected price to get maximum participation`,
          data: {},
        });
      } else {
        console.warn(`[Push] No user found for car.sellerContactNumber=${selfInspectedCar.sellerContactNumber}. Skipping dealer (seller) push.`);
      }

    }
  } catch (_) {
    console.error(`[ScheduleSelfInspectedCarAuction] Error in job execution:`, _);
  }


  return job;
};

