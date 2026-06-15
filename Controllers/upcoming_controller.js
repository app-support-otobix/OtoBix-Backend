// controllers/upcoming_controller.js
const mongoose = require('mongoose');
const Car = require('../Models/carModel');
const SocketService = require('../Config/socket_service');
const EVENTS = require('../Sockets/socket_events');
const CONSTANTS = require('../Utils/constants');
const CarDetailsForCarsListModel = require('../Shared/car_details_for_cars_list_model');
const { getAgenda } = require('../Agenda/agenda');



// import the scheduler helper from your job file
const { scheduleMoveCarFromUpcomingToLive } =
    require('../Agenda/Agenda Jobs/move_car_from_upcoming_to_live_job');


function safeDate(v) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

function isScheduleTimePastOrNow(date, skewMs = 1500) {
    const t = new Date(date).getTime();
    const now = Date.now();
    return Number.isFinite(t) && t <= now + skewMs;
}

// Move car to upcoming or live
exports.updateCarAuctionTime = async (req, res) => {
    try {
        const { carId, auctionStartTime, auctionEndTime, auctionDuration, auctionMode } = req.body;

        if (!carId || !mongoose.isValidObjectId(carId)) {
            return res.status(400).json({ ok: false, message: 'Invalid carId' });
        }

        const durationHrs = Number(auctionDuration);
        if (!Number.isFinite(durationHrs) || durationHrs <= 0) {
            return res.status(400).json({ ok: false, message: 'Invalid auctionDuration' });
        }


        const start = safeDate(auctionStartTime);
        const end = safeDate(auctionEndTime);

        if (!start || !end) {
            return res.status(400).json({ ok: false, message: 'Invalid start/end time' });
        }

        const now = new Date();

        // Fetch car (for status checks & socket payload later)
        const car = await Car.findById(carId);
        if (!car) {
            return res.status(404).json({ ok: false, message: 'Car not found' });
        }

        // Get agenda instance (store it in app at bootstrap: app.set('agenda', agenda))
        // const agenda = req.app.get('agenda');
        const agenda = getAgenda();

        // Cancel any prior jobs for this car (defense-in-depth)
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_UPCOMING_TO_LIVE, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.START_LIVE_AUCTION, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.END_LIVE_AUCTION, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_OTOBUY_TO_AUCTION_COMPLETED, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_EVERY_SIX_HOURS_IF_CAR_IS_LIVE, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE, 'data.carId': carId.toString() });
        
        const isNow = (auctionMode === 'makeLiveNow');

        if (isNow) {
            // Flip to LIVE immediately (idempotent)
            await Car.updateOne(
                { _id: carId }, // allow flipping from upcoming or correcting fields if already live
                {
                    $set: {
                        auctionStatus: CONSTANTS.AUCTION_STATUS.LIVE,
                        liveAt: now,
                        auctionStartTime: now,
                        auctionDuration: durationHrs,
                        auctionEndTime: new Date(now.getTime() + durationHrs * 3600 * 1000),
                        upcomingUntil: now,
                    },
                }
            );

            // Emit sockets to keep clients in sync
            const fresh = await Car.findById(carId).lean();
            const listing = CarDetailsForCarsListModel.setCarDetails(fresh);

            // Remove from UPCOMING section when auction started
            SocketService.emitToRoom(
                EVENTS.UPCOMING_BIDS_SECTION_ROOM, EVENTS.UPCOMING_BIDS_SECTION_UPDATED,
                { action: 'removed', id: carId.toString(), car: listing, message: 'Car moved from UPCOMING to LIVE' }
            );

            // Remove from AUCTION ENDED section when auction started
            SocketService.emitToRoom(
                EVENTS.AUCTION_COMPLETED_CARS_SECTION_ROOM, EVENTS.AUCTION_COMPLETED_CARS_SECTION_UPDATED,
                { action: 'removed', id: carId.toString(), car: listing, message: 'Car moved from AUCTION ENDED to LIVE' }
            );
    
            // Remove from OTOBUY section when auction started
            SocketService.emitToRoom(EVENTS.OTOBUY_CARS_SECTION_ROOM, EVENTS.OTOBUY_CARS_SECTION_UPDATED, {
                action: 'removed', id: carId.toString(), message: 'Car removed from otobuy section',
            });

            // Add to LIVE section when auction started
            SocketService.emitToRoom(
                EVENTS.LIVE_BIDS_SECTION_ROOM, EVENTS.LIVE_BIDS_SECTION_UPDATED,
                { action: 'added', id: carId.toString(), car: listing, message: 'Car is now LIVE' }
            );


            // Start auction job
            const { scheduleStartLiveAuction } =
                require('../Agenda/Agenda Jobs/start_live_auction_job');

            await scheduleStartLiveAuction(agenda, carId.toString(), new Date());


            return res.json({ ok: true, mode: 'now' });
        } else {

            const startIsNowOrPast = isScheduleTimePastOrNow(start);

            if (startIsNowOrPast) {
                // behave exactly like "make live now"
                const now = start;

                await Car.updateOne(
                    { _id: carId },
                    {
                        $set: {
                            auctionStatus: CONSTANTS.AUCTION_STATUS.LIVE,
                            liveAt: now,
                            auctionStartTime: now,
                            auctionDuration: durationHrs,
                            auctionEndTime: new Date(now.getTime() + durationHrs * 3600 * 1000),
                            upcomingUntil: now,
                        },
                    }
                );

                // emit sockets (you already have this block in isNow; reuse it)
                const fresh = await Car.findById(carId).lean();
                const listing = CarDetailsForCarsListModel.setCarDetails(fresh);

                // Remove from UPCOMING section when auction started
                SocketService.emitToRoom(
                    EVENTS.UPCOMING_BIDS_SECTION_ROOM, EVENTS.UPCOMING_BIDS_SECTION_UPDATED,
                    { action: 'removed', id: carId.toString(), car: listing, message: 'Car moved from UPCOMING to LIVE' }
                );

                // Remove from AUCTION ENDED section when auction started
                SocketService.emitToRoom(
                    EVENTS.AUCTION_COMPLETED_CARS_SECTION_ROOM, EVENTS.AUCTION_COMPLETED_CARS_SECTION_UPDATED,
                    { action: 'removed', id: carId.toString(), car: listing, message: 'Car moved from AUCTION ENDED to LIVE' }
                );
    
                // Remove from OTOBUY section when auction started
                SocketService.emitToRoom(EVENTS.OTOBUY_CARS_SECTION_ROOM, EVENTS.OTOBUY_CARS_SECTION_UPDATED, {
                    action: 'removed', id: carId.toString(), message: 'Car removed from otobuy section',
                });

                // Add to LIVE section when auction started
                SocketService.emitToRoom(
                    EVENTS.LIVE_BIDS_SECTION_ROOM, EVENTS.LIVE_BIDS_SECTION_UPDATED,
                    { action: 'added', id: carId.toString(), car: listing, message: 'Car is now LIVE' }
                );

                // start the chain now
                const { scheduleStartLiveAuction } =
                    require('../Agenda/Agenda Jobs/start_live_auction_job');
                await scheduleStartLiveAuction(agenda, carId.toString(), new Date());

                return res.json({ ok: true, mode: 'schedule->now' });
            }



            // Save upcoming schedule for future
            await Car.updateOne(
                { _id: carId },
                {
                    $set: {
                        auctionStatus: CONSTANTS.AUCTION_STATUS.UPCOMING,
                        auctionStartTime: start,
                        auctionDuration: durationHrs,
                        auctionEndTime: new Date(start.getTime() + durationHrs * 3600 * 1000),
                        upcomingUntil: start,
                    },
                }
            );

                // Remove from LIVE section
                SocketService.emitToRoom(EVENTS.LIVE_BIDS_SECTION_ROOM, EVENTS.LIVE_BIDS_SECTION_UPDATED, {
                    action: 'removed', id: carId.toString(), message: 'Car removed from live section',
                });

                // Remove from AUCTION ENDED section
                SocketService.emitToRoom(
                    EVENTS.AUCTION_COMPLETED_CARS_SECTION_ROOM, EVENTS.AUCTION_COMPLETED_CARS_SECTION_UPDATED,
                    { action: 'removed', id: carId.toString(), message: 'Car moved from AUCTION ENDED to LIVE' }
                );
    
                // Remove from OTOBUY section when auction started
                SocketService.emitToRoom(EVENTS.OTOBUY_CARS_SECTION_ROOM, EVENTS.OTOBUY_CARS_SECTION_UPDATED, {
                    action: 'removed', id: carId.toString(), message: 'Car removed from otobuy section',
                });


            await scheduleMoveCarFromUpcomingToLive(agenda, carId.toString(), start);

            // Optionally tell clients this upcoming item got updated (so their countdown resets)
            // try {
            //     const fresh = await Car.findById(carId).lean();
            //     const listing = CarDetailsForCarsListModel.setCarDetails(fresh);

            //     SocketService.emitToRoom(
            //         EVENTS.UPCOMING_BIDS_SECTION_ROOM,
            //         EVENTS.UPCOMING_BIDS_SECTION_UPDATED,
            //         {
            //             action: 'updated', // <- differentiate from a new add
            //             id: carId.toString(),
            //             car: listing,
            //             upcomingUntil: start,
            //             message: 'Upcoming auction rescheduled',
            //         }
            //     );
            // } catch (_) { }

            return res.json({ ok: true, mode: 'schedule' });
        }
    } catch (err) {
        console.error('[updateCarAuctionTime] error:', err);
        return res.status(500).json({ ok: false, message: 'Server error' });
    }
};














// exports.updateAuctionTime1 = async (req, res) => {
//     try {
//         const { carId, auctionStartTime, auctionDuration } = req.body;

//         if (!carId) {
//             return res.status(400).json({ error: 'carId is required' });
//         }

//         const updateData = {};
//         let startTimeToUse = null;

//         // Set auctionStartTime if provided
//         if (auctionStartTime) {
//             const parsedStart = new Date(auctionStartTime);
//             updateData.auctionStartTime = parsedStart;
//             startTimeToUse = parsedStart;
//         }

//         // Set auctionDuration if provided
//         if (auctionDuration !== undefined) {
//             updateData.auctionDuration = auctionDuration;
//         }

//         // If either startTime or duration is being updated, calculate auctionEndTime
//         if ((auctionStartTime || auctionDuration !== undefined)) {
//             // Get current car data to fill missing value if one is not provided
//             const car = await CarModel.findById(carId);
//             if (!car) return res.status(404).json({ error: 'Car not found' });

//             const finalStartTime = startTimeToUse || car.auctionStartTime;
//             const finalDuration = auctionDuration !== undefined ? auctionDuration : car.auctionDuration;

//             if (finalStartTime && finalDuration !== undefined) {
//                 const endTime = new Date(new Date(finalStartTime).getTime() + finalDuration * 3600000);
//                 updateData.auctionEndTime = endTime;
//             }
//         }

//         // ✅ Force auction status to "live" when updating
//         updateData.auctionStatus = CONSTANTS.AUCTION_STATUS.LIVE;

//         if (Object.keys(updateData).length === 0) {
//             return res.status(400).json({ error: 'No fields to update' });
//         }

//         const updatedCar = await CarModel.findByIdAndUpdate(
//             carId,
//             updateData,
//             { new: true }
//         );

//         if (!updatedCar) {
//             return res.status(404).json({ error: 'Car not found' });
//         }

//         // emit to that car room
//         SocketService.emitToRoom(
//             EVENTS.AUCTION_TIMER_ROOM,
//             EVENTS.AUCTION_TIMER_UPDATED,
//             {
//                 carId: updatedCar._id.toString(),
//                 auctionStartTime: updatedCar.auctionStartTime,
//                 auctionEndTime: updatedCar.auctionEndTime,
//                 auctionDuration: updatedCar.auctionDuration,
//                 auctionStatus: updatedCar.auctionStatus
//             }
//         );

//         // Tell the ui that a new car is added in the live bids section
//         const { addCarToLiveBidsHelper } = require('../Helper Functions/add_car_to_live_bids_helper');
//         const addedCar = addCarToLiveBidsHelper(updatedCar);

//         SocketService.emitToRoom(EVENTS.LIVE_BIDS_SECTION_ROOM, EVENTS.LIVE_BIDS_SECTION_UPDATED, {
//             action: 'added',
//             id: updatedCar._id.toString(),
//             car: addedCar,
//             message: 'Car added to live bids section',
//         });


//         // ✅ Just one line to schedule
//         const AgendaJobs = require('../Config/agenda_jobs');
//         await AgendaJobs.scheduleAuctionEnd(updatedCar._id.toString(), updatedCar.auctionEndTime);


//         res.json({ success: true, data: updatedCar });
//     } catch (error) {
//         console.error('Update error:', error);
//         res.status(500).json({ error: 'Failed to update car fields' });
//     }
// };