// Agenda/Agenda Jobs/move_car_from_otobuy_to_auction_completed_job.js
const mongoose = require('mongoose');
const CarModel = require('../../Models/carModel');
const SocketService = require('../../Config/socket_service');
const CONSTANTS = require('../../Utils/constants');
const EVENTS = require('../../Sockets/socket_events');

const { sendPushToExternalId } = require('../../Helper Functions/send_notification_helpers');
const { getCustomerIdByPhoneNumber } = require('../../Helper Functions/external_id_extraction_helpers');

module.exports = (agenda) => {
    agenda.define(
        CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_OTOBUY_TO_AUCTION_COMPLETED,
        { priority: 'high', concurrency: 50, lockLifetime: 30_000 },
        async (job, done) => {
            try {
                // ✅ THIS RUNS ONLY WHEN SCHEDULED TIME ARRIVES (after 3 days)
                const { carId } = job.attrs.data || {};
                if (!carId || !mongoose.isValidObjectId(carId)) {
                    return done(new Error('Invalid or missing carId'));
                }

                // Atomic one-time flip: only if STILL OTOBUY
                const result = await CarModel.updateOne(
                    { _id: carId, auctionStatus: CONSTANTS.AUCTION_STATUS.OTOBUY },
                    {

                        $set: {
                            auctionStatus: CONSTANTS.AUCTION_STATUS.LIVEAUCTIONENDED,
                        },
                    }
                );

                // If it actually moved
                if (result.modifiedCount === 1) {
                    const updated = await CarModel.findById(carId).lean();

                    // ✅ Socket: removed from OTOBUY section
                    SocketService.emitToRoom(EVENTS.OTOBUY_CARS_SECTION_ROOM, EVENTS.OTOBUY_CARS_SECTION_UPDATED, {
                        action: 'removed',
                        id: updated._id.toString(),
                    });



                    // ✅ Push: notify customer
                    const customerId = await getCustomerIdByPhoneNumber(updated.contactNumber);
                    if (customerId) {
                        await sendPushToExternalId({
                            externalId: customerId,
                            title: 'Car Moved to Completed Auctions',
                            body: `${updated.make} ${updated.model} has been moved to Completed Auctions. You can rerun auction or proceed further.`,
                            data: {
                                carId: updated._id.toString(),
                            },
                        });
                    }


                }


                // ✅ Always cancel the job when job execute time comes
                await agenda.cancel({
                    name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_OTOBUY_TO_AUCTION_COMPLETED,
                    'data.carId': carId.toString(),
                });

                return done();
            } catch (err) {
                return done(err);
            }
        }
    );
};

// Helper: schedule after N days — ✅ DOES NOTHING ELSE
module.exports.scheduleMoveCarFromOtobuyToAuctionCompleted = async function (
    agenda,
    carId,
    baseTime = new Date(),
    days = 3
) {
    // ✅ THIS RUNS IMMEDIATELY WHEN YOU CALL IT (job scheduling time)
    const when = new Date(baseTime);
    when.setDate(when.getDate() + days);

    const job = agenda.create(CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_OTOBUY_TO_AUCTION_COMPLETED, {
        carId: carId.toString(),
    });

    job.unique({
        name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_OTOBUY_TO_AUCTION_COMPLETED,
        'data.carId': carId.toString(),
    });

    job.schedule(when);
    await job.save();

    // ✅ No push, no sockets, no DB updates here (as you requested)
    return job;
};
