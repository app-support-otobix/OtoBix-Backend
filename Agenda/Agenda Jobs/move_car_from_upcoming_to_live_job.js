// Agenda/Agenda Jobs/move-car-from-upcoming-to-live-job.js
const mongoose = require('mongoose');
const Car = require('../../Models/carModel');
const SocketService = require('../../Config/socket_service');
const CONSTANTS = require('../../Utils/constants');
const EVENTS = require('../../Sockets/socket_events');
const { scheduleStartLiveAuction } = require('./start_live_auction_job');
const { sendPushToExternalId, sendPushToAllDealers } = require('../../Helper Functions/send_notification_helpers');
const { getCustomerIdByPhoneNumber } = require('../../Helper Functions/external_id_extraction_helpers');
const { runEwiForCar } = require('../../Helper Functions/request_ewi_certification_api_helper')
const CarDetailsForCarsListModel = require('../../Shared/car_details_for_cars_list_model');

/**
 * Job: move-car-to-live
 * - Runs ONCE at its scheduled time.
 * - Uniqueness key: (job name + carId) so the same car cannot be scheduled twice.
 * - Idempotent DB update: flips only if still 'upcoming'.
 */
module.exports = (agenda) => {
  agenda.define(
    CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_UPCOMING_TO_LIVE,
    { priority: 'high', concurrency: 50, lockLifetime: 30_000 },
    async (job, done) => {
      try {
        const { carId } = job.attrs.data || {};
        if (!carId || !mongoose.isValidObjectId(carId)) {
          return done(new Error('Invalid or missing carId'));
        }

        const now = new Date();

        // Atomic one-time flip. If already flipped, modifiedCount = 0.
        const result = await Car.updateOne(
          { _id: carId, auctionStatus: CONSTANTS.AUCTION_STATUS.UPCOMING },
          {
            $set: { auctionStatus: CONSTANTS.AUCTION_STATUS.LIVE, liveAt: now },
            // $unset: { upcomingUntil: '' },
          }
        );

        // If car is moved from UPCOMING to LIVE
        if (result.modifiedCount === 1) {

          // Fetch updated doc
          const updated = await Car.findById(carId).lean();

          // const carDataForCarsListModelInFlutter = buildListing(updated);
          const carDataForCarsListModelInFlutter = CarDetailsForCarsListModel.setCarDetails(updated);

          // Remove from UPCOMING section when auction started
          SocketService.emitToRoom(
            EVENTS.UPCOMING_BIDS_SECTION_ROOM,
            EVENTS.UPCOMING_BIDS_SECTION_UPDATED,
            {
              action: 'removed',
              id: carId.toString(),
              car: carDataForCarsListModelInFlutter,
              message: 'Car moved from UPCOMING to LIVE',
            }
          );

          // Remove from AUCTION ENDED section when auction started
          SocketService.emitToRoom(
            EVENTS.AUCTION_COMPLETED_CARS_SECTION_ROOM,
            EVENTS.AUCTION_COMPLETED_CARS_SECTION_UPDATED,
            { action: 'removed', id: carId.toString(), car: carDataForCarsListModelInFlutter, message: 'Car moved from AUCTION ENDED to LIVE' }
          );
          console.log('Car moved from UPCOMING to LIVE', carId.toString());

          // Add to LIVE section when auction started
          SocketService.emitToRoom(
            EVENTS.LIVE_BIDS_SECTION_ROOM,
            EVENTS.LIVE_BIDS_SECTION_UPDATED,
            {
              action: 'added',
              id: carId.toString(),
              car: carDataForCarsListModelInFlutter,
              message: 'Car is now LIVE',
            }
          );


          // Start live auction after you set auctionStatus: 'live', liveAt, auctionStartTime, auctionDuration, auctionEndTime
          await scheduleStartLiveAuction(agenda, carId, updated.auctionStartTime);



          // Cleanup (defense-in-depth): remove any stray future jobs for same car
          await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_UPCOMING_TO_LIVE, 'data.carId': carId.toString() });
        }

        return done();
      } catch (err) {
        return done(err);
      }
    }
  );
};





// Helper to schedule a unique one-off run time.
module.exports.scheduleMoveCarFromUpcomingToLive = async function scheduleMoveCarFromUpcomingToLive(
  agenda,
  carId,
  when // Date or parsable string
) {


  const job = agenda.create(CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_UPCOMING_TO_LIVE, { carId: carId.toString() });

  // Uniqueness: prevent duplicate jobs for the same car
  job.unique({ name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_UPCOMING_TO_LIVE, 'data.carId': carId.toString() });



  job.schedule(when);
  await job.save();



  // ✅ When job is scheduled announce to UPCOMING room (single place, no extra jobs)
  try {
    // Read fresh car (optional but nice to send full payload)
    const car = await Car.findById(carId).lean();

    // Only announce if it’s really marked upcoming right now
    if (car && car.auctionStatus === CONSTANTS.AUCTION_STATUS.UPCOMING) {
      // const carDataForCarsListModelInFlutter = buildListing(car);
      const carDataForCarsListModelInFlutter = CarDetailsForCarsListModel.setCarDetails(car);

      SocketService.emitToRoom(
        EVENTS.UPCOMING_BIDS_SECTION_ROOM, EVENTS.UPCOMING_BIDS_SECTION_UPDATED,
        {
          action: 'added',                 // or 'updated' for reschedules
          id: carId.toString(),
          car: carDataForCarsListModelInFlutter,
          upcomingUntil: car.upcomingUntil,
          message: 'Car added to UPCOMING (countdown scheduled)',
        }
      );

      // Send push notification to all users
      await sendPushToAllDealers({
        title: 'New Upcoming Car 🚗',
        body: `${car.make} ${car.model} is now available in Upcoming Auctions!`,
        data: {
          carId: car._id.toString(),
          screen: 'upcoming',
          navigateToScreen: CONSTANTS.NOTIFICATION_ROUTES.CAR_ADDED_IN_UPCOMING,
          parametersForScreen: {
            carId: car._id.toString(),
            currentOpenSection: CONSTANTS.HOME_SCREEN_SECTIONS.UPCOMING_SECTION_SCREEN,
          }
        },
      });

      // Notify customer that his car is in upcoming auction
      const customerId = await getCustomerIdByPhoneNumber(car.contactNumber);
      if (customerId) {
        await sendPushToExternalId({
          externalId: customerId,
          title: `${car.make} ${car.model} is now in Upcoming Auctions`,
          body: `Set your expected price to get maximum participation`,
          data: {},
        });
      } else {
        console.warn(`[Push] No user found for car.contactNumber=${car.contactNumber}. Skipping customer push.`);
      }

      // Run EWI automatically for car (safe)
      runEwiForCar(carId.toString());



    }
  } catch (_) { }


  return job;
};


// // Build the client-facing "listing" payload (same shape as getCarList)
// function buildListing(src) {
//   const car = src?.toObject ? src.toObject() : (src || {});

//   const getFirstImage = (val) => {
//     if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
//     if (typeof val === 'string') return val || null;
//     return null;
//   };

//   const imageMapping = [
//     { field: 'frontMain', title: 'Front View' },
//     { field: 'lhsFront45Degree', title: 'Left Front 45°' },
//     { field: 'rearMain', title: 'Rear View' },
//     { field: 'rearWithBootDoorOpen', title: 'Boot Open View' },
//     { field: 'rhsRear45Degree', title: 'Right Rear 45°' },
//     { field: 'engineBay', title: 'Engine Compartment' },
//     { field: 'meterConsoleWithEngineOn', title: 'Meter Console' },
//     { field: 'frontSeatsFromDriverSideDoorOpen', title: 'Front Seats' },
//     { field: 'rearSeatsFromRightSideDoorOpen', title: 'Rear Seats' },
//     { field: 'dashboardFromRearSeat', title: 'Dashboard View' },
//     { field: 'sunroofImages', title: 'Sunroof View' },
//   ];

//   const imageUrls = imageMapping
//     .map(({ field, title }) => {
//       const url = getFirstImage(car[field]);
//       return url ? { title, url } : null;
//     })
//     .filter(Boolean);

//   const imageUrl = getFirstImage(car.frontMain) || '';

//   const isInspected = String(car.approvalStatus || '').toUpperCase() === 'APPROVED';

//   const num = (v) => {
//     if (v == null) return 0;
//     const n = typeof v === 'number' ? v : parseFloat(v);
//     return Number.isFinite(n) ? n : 0;
//   };
//   const int = (v) => {
//     if (v == null) return 0;
//     const n = typeof v === 'number' ? v : parseInt(String(v), 10);
//     return Number.isFinite(n) ? n : 0;
//   };

//   return {
//     id: (car._id || car.id || '').toString(),
//     appointmentId: (car.appointmentId || '').toString(),
//     imageUrl,
//     make: car.make ?? '',
//     model: car.model ?? '',
//     variant: car.variant ?? '',
//     priceDiscovery: num(car.priceDiscovery),
//     yearMonthOfManufacture: car.yearMonthOfManufacture ?? null, //?
//     odometerReadingInKms: int(car.odometerReadingInKms), //?
//     ownerSerialNumber: int(car.ownerSerialNumber),
//     fuelType: car.fuelType ?? '',
//     // commentsOnTransmission: car.commentsOnTransmission ?? '',
//     commentsOnTransmission: car.transmissionTypeDropdownList?.[0] ?? car.commentsOnTransmission ?? '',
//     roadTaxValidity: car.roadTaxValidity ?? '',
//     taxValidTill: car.taxValidTill ?? null,
//     registrationNumber: car.registrationNumber ?? '',
//     registeredRto: car.registeredRto ?? '',
//     registrationState: car.registrationState ?? '',
//     inspectionLocation: car.city ?? '', //?
//     isInspected,
//     cubicCapacity: car.cubicCapacity ?? 0,
//     oneClickPrice: parseFloat(car.oneClickPrice || 0.0),
//     otobuyOffer: parseFloat(car.otobuyOffer || 0.0),
//     soldAt: parseFloat(car.soldAt || 0.0),
//     highestBid: num(car.highestBid),
//     highestBidder: car.highestBidder ?? '',
//     auctionStartTime: car.auctionStartTime ?? null,
//     auctionEndTime: car.auctionEndTime ?? null,
//     auctionDuration: int(car.auctionDuration),
//     auctionStatus: car.auctionStatus ?? '',
//     upcomingTime: car.upcomingTime ?? null,
//     upcomingUntil: car.upcomingUntil ?? null,
//     liveAt: car.liveAt ?? null,
//     customerExpectedPrice: parseFloat(car.customerExpectedPrice || 0),
//     fixedMargin: parseFloat(car.fixedMargin || 0),
//     variableMargin: parseFloat(car.variableMargin || 0),
//     registeredOwner: car.registeredOwner ?? '',
//     registeredAddressAsPerRc: car.registeredAddressAsPerRc ?? '',
//     contactNumber: car.contactNumber ?? '',
//     emailAddress: car.emailAddress ?? '',
//     ieName: car.ieName ?? '',
//     chassisNumber: car.chassisNumber ?? '',
//     engineNumber: car.engineNumber ?? '',
//     imageUrls,
//   };
// }
