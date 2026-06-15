const CarModel = require('../Models/carModel');
const UserModel = require('../Models/userModel');
const SocketService = require('../Config/socket_service');
const CONSTANTS = require('../Utils/constants');
const EVENTS = require('../Sockets/socket_events');
const BidModel = require('../Models/bidModel');
const TelecallingsModel = require('../Models/telecallingsModel');
const AutoBidModelForLiveSection = require('../Models/autoBidModelForLiveSection');
const AuctionController = require('../Controllers/auction_controller');
const { getAgenda } = require('../Agenda/agenda');
const CarDetailsForCarsListModel = require('../Shared/car_details_for_cars_list_model');
const { getCustomerIdByPhoneNumber, getUserIdByPhoneNumber } = require('../Helper Functions/external_id_extraction_helpers');
const { sendPushToExternalId } = require('../Helper Functions/send_notification_helpers');
const {
    setCarFieldsAccordingToCarModel,
    replaceFilePathsWithDriveUrls,
    convertImagesToCloudinary,
    scheduleJobsForUpcomingCars,
    // normalizeAuctionFields,
    setAuctionTimes,
} = require('../Helper Functions/add_car_helpers');



// Get car details
exports.getCarDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const { appointmentId } = req.query; // optional

        let carDetails;

        // If appointmentId is provided, fetch by appointmentId
        if (appointmentId) {
            carDetails = await CarModel.findOne({ appointmentId });
        } else {
            // existing behavior (no change)
            carDetails = await CarModel.findById(id);
        }

        // const carDetails = await CarModel.findById(id);

        if (!carDetails) {
            return res.status(404).json({
                success: false,
                message: 'Car not found',
            });
        }

        ///////////////// Only for now to set commentsOnTransmission for Frontend ///////////////
        const carDetailsObj = carDetails.toObject();
        carDetailsObj.commentsOnTransmission = carDetails.transmissionTypeDropdownList?.[0] ?? carDetails.commentsOnTransmission ?? '';
        ///////////////// Only for now to set commentsOnTransmission for Frontend ///////////////

        res.status(200).json({
            success: true,
            message: 'Car details fetched successfully.',
            // carDetails,
            carDetails: carDetailsObj,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message,
        });
    }
};


// Update car details
exports.updateCarDetails = async (req, res) => {
    try {
        const { carId, ...fieldsToUpdate } = req.body;

        // 1) Validate carId
        if (!carId) {
            return res.status(400).json({
                success: false,
                message: 'carId is required.',
            });
        }

        // 2) Remove fields that should never be updated
        const forbiddenFields = ['_id', 'id', '__v', 'createdAt', 'updatedAt'];
        forbiddenFields.forEach((field) => delete fieldsToUpdate[field]);

        // 3) Remove undefined values (so they don’t overwrite existing fields)
        Object.keys(fieldsToUpdate).forEach((key) => {
            if (fieldsToUpdate[key] === undefined) delete fieldsToUpdate[key];
        });

        // If user didn't send anything to update
        if (Object.keys(fieldsToUpdate).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields provided to update.',
            });
        }

        // 4) Update only provided fields (others remain unchanged)
        const updatedCar = await CarModel.findByIdAndUpdate(
            carId,
            { $set: fieldsToUpdate },
            { new: true, runValidators: true }
        );

        if (!updatedCar) {
            return res.status(404).json({
                success: false,
                message: 'Car not found.',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Car updated successfully.',
            updatedFields: Object.keys(fieldsToUpdate),
            carDetails: updatedCar,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Server error',
            error: error.message,
        });
    }
};



// Helper function to build auctionStatus filter
function buildAuctionStatusFilter(raw) {
    if (raw == null || raw === '') return null;

    // Support repeated keys & comma separated values
    const list = Array.isArray(raw) ? raw : String(raw).split(',');

    // Trim, drop empties, and dedupe while preserving case
    const cleaned = [...new Set(list.map(s => String(s).trim()).filter(Boolean))];

    // If 'all' present, skip filtering
    if (cleaned.some(s => s.toLowerCase() === 'all')) return null;

    if (cleaned.length === 0) return null;
    if (cleaned.length === 1) return { auctionStatus: cleaned[0] };
    return { auctionStatus: { $in: cleaned } };
}




// Get Cars list for different screens e.g. live, upcoming etc
exports.getCarList = async (req, res) => {
    try {
        // const { auctionStatus } = req.query;
        // const filter = {};
        // if (auctionStatus) {
        //     if (auctionStatus != "all") {
        //         // filter.auctionStatus = auctionStatus.toLowerCase();
        //         filter.auctionStatus = auctionStatus;
        //     }
        // }

        // ⬇️ Only change: build status filter via helper
        const filter = {};
        const statusFilter = buildAuctionStatusFilter(req.query.auctionStatus);
        if (statusFilter) Object.assign(filter, statusFilter);

        const projection = {
            _id: 1,
            appointmentId: 1,
            make: 1,
            model: 1,
            variant: 1,
            priceDiscovery: 1,
            yearMonthOfManufacture: 1,
            odometerReadingInKms: 1,
            ownerSerialNumber: 1,
            fuelType: 1,
            transmissionTypeDropdownList: 1,
            commentsOnTransmission: 1,
            roadTaxValidity: 1,
            taxValidTill: 1,
            registrationNumber: 1,
            registeredRto: 1,
            registrationState: 1,
            registrationDate: 1,
            city: 1,
            approvalStatus: 1,
            cubicCapacity: 1,
            oneClickPrice: 1,
            otobuyOffer: 1,
            soldAt: 1,
            highestBid: 1,
            highestBidder: 1,
            auctionStartTime: 1,
            auctionEndTime: 1,
            auctionDuration: 1,
            auctionStatus: 1,
            upcomingTime: 1,
            upcomingUntil: 1,
            liveAt: 1,
            soldTo: 1,
            customerExpectedPrice: 1,
            fixedMargin: 1,
            variableMargin: 1,
            registeredOwner: 1,
            registeredAddressAsPerRc: 1,
            contactNumber: 1,
            emailAddress: 1,
            chassisNumber: 1,
            engineNumber: 1,
            // Images
            frontMain: 1,
            rearMain: 1,
            lhsFront45Degree: 1,
            rearWithBootDoorOpen: 1,
            rhsRear45Degree: 1,
            engineBay: 1,
            meterConsoleWithEngineOn: 1,
            frontSeatsFromDriverSideDoorOpen: 1,
            rearSeatsFromRightSideDoorOpen: 1,
            dashboardFromRearSeat: 1,
            sunroofImages: 1
        };

        // 1) Fetch cars
        const cars = await CarModel.find(filter, projection)
        // .sort({ updatedAt: -1 })   // latest updated first
        .lean();

        // 2) Collect all soldTo ids (non-null)
        const soldToIds = [
            ...new Set(
                cars
                    .map(c => c.soldTo)
                    .filter(Boolean)            // remove null/undefined
                    .map(id => id.toString())
            ),
        ];

        // 3) Fetch those users
        let userNameById = {};
        if (soldToIds.length > 0) {
            const users = await UserModel.find({ _id: { $in: soldToIds } })
                .select('_id userName')
                .lean();

            userNameById = users.reduce((acc, u) => {
                const key = u._id.toString();
                // choose what you want to display on UI
                acc[key] = u.userName || '';
                return acc;
            }, {});
        }

        // 4) Build listings
        const listings = cars.map(car => {



            const getFirstImage = (val) => {
                if (Array.isArray(val)) return val.length > 0 ? val[0] : null;
                if (typeof val === 'string') return val;
                return null;
            };




            const imageMapping = [
                { field: 'frontMain', title: 'Front View' },
                { field: 'lhsFront45Degree', title: 'Left Front 45°' },
                { field: 'rearMain', title: 'Rear View' },
                { field: 'rearWithBootDoorOpen', title: 'Boot Open View' },
                { field: 'rhsRear45Degree', title: 'Right Rear 45°' },
                { field: 'engineBay', title: 'Engine Compartment' },
                { field: 'meterConsoleWithEngineOn', title: 'Meter Console' },
                { field: 'frontSeatsFromDriverSideDoorOpen', title: 'Front Seats' },
                { field: 'rearSeatsFromRightSideDoorOpen', title: 'Rear Seats' },
                { field: 'dashboardFromRearSeat', title: 'Dashboard View' },
                { field: 'sunroofImages', title: 'Sunroof View' },
            ];

            const imageUrls = imageMapping.map(({ field, title }) => {
                const url = getFirstImage(car[field]);
                return url ? { title, url } : null;
            }).filter(Boolean);

            // Safe conversion helpers
            const imageUrl = Array.isArray(car.frontMain) ? car.frontMain[0] : (car.frontMain || '');
            const isInspected = (car.approvalStatus || '').toUpperCase() === 'APPROVED';

            const soldToIdStr = car.soldTo ? car.soldTo.toString() : null;
            const soldToName = soldToIdStr ? (userNameById[soldToIdStr] || '') : '';

            return {
                id: car._id.toString() ?? '',
                appointmentId: (car.appointmentId || '').toString(),
                imageUrl,
                make: car.make ?? '',
                model: car.model ?? '',
                variant: car.variant ?? '',
                priceDiscovery: parseFloat(car.priceDiscovery || 0),
                yearMonthOfManufacture: car.yearMonthOfManufacture ?? null,
                odometerReadingInKms: parseInt(car.odometerReadingInKms || 0),
                ownerSerialNumber: parseInt(car.ownerSerialNumber || 0),
                fuelType: car.fuelType ?? '',
                commentsOnTransmission: car.transmissionTypeDropdownList?.[0] ?? car.commentsOnTransmission ?? '',
                roadTaxValidity: car.roadTaxValidity ?? '',
                taxValidTill: car.taxValidTill ?? null,
                registrationNumber: car.registrationNumber ?? '',
                registeredRto: car.registeredRto ?? '',
                registrationState: car.registrationState ?? '',
                registrationDate: car.registrationDate ?? null,
                inspectionLocation: car.city ?? '',
                isInspected,
                cubicCapacity: car.cubicCapacity ?? 0,
                oneClickPrice: parseFloat(car.oneClickPrice || 0),
                otobuyOffer: parseFloat(car.otobuyOffer || 0),
                soldAt: parseFloat(car.soldAt || 0),
                highestBid: parseFloat(car.highestBid || 0),
                highestBidder: car.highestBidder ?? '',
                auctionStartTime: car.auctionStartTime ?? null,
                auctionEndTime: car.auctionEndTime ?? null,
                auctionDuration: parseInt(car.auctionDuration || 0),
                auctionStatus: car.auctionStatus ?? '',
                upcomingTime: car.upcomingTime ?? null,
                upcomingUntil: car.upcomingUntil ?? null,
                liveAt: car.liveAt ?? null,
                soldTo: soldToIdStr,
                soldToName,
                customerExpectedPrice: parseFloat(car.customerExpectedPrice || 0),
                // variableMargin: parseFloat(car.variableMargin || 0),
                fixedMargin: car.fixedMargin ?? null,
                variableMargin: car.variableMargin ?? null,
                registeredOwner: car.registeredOwner ?? '',
                registeredAddressAsPerRc: car.registeredAddressAsPerRc ?? '',
                contactNumber: car.contactNumber ?? '',
                emailAddress: car.emailAddress ?? '',
                chassisNumber: car.chassisNumber ?? '',
                engineNumber: car.engineNumber ?? '',
                imageUrls

            };
        });


        res.json(listings);
    } catch (error) {
        console.error('Error fetching car listings:', error);
        res.status(500).json({ error: 'Failed to fetch car listings' });
    }
};


// // Update bid
// exports.updateBid = async (req, res) => {
//     try {
//         const { carId, newBidAmount, userId } = req.body;

//         if (!carId || !newBidAmount || !userId) {
//             return res.status(400).json({ error: 'carId and newBid and userId are required' });
//         }

//         //  Fetch car to validate bid
//         const carDetailsForValidation = await CarModel.findById(carId);
//         if (!carDetailsForValidation) {
//             return res.status(404).json({ error: 'Car not found' });
//         }

//         //  Prevent lower or same bid
//         if (newBidAmount <= carDetailsForValidation.highestBid) {
//             return res.status(403).json({ error: 'Bid must be higher than current highest bid.' });
//         }

//         // Store bid in bids collection
//         const bid = new BidModel({
//             carId,
//             userId,
//             bidAmount: newBidAmount,
//             time: new Date()
//         });
//         await bid.save();

//         // Update highestBid and highestBidder in car document
//         const carDetailsToUpdateCarDocument = await CarModel.findByIdAndUpdate(
//             carId,
//             {
//                 highestBid: newBidAmount,
//                 highestBidder: userId
//             },
//             { new: true }
//         );

//         if (!carDetailsToUpdateCarDocument) {
//             return res.status(404).json({ error: 'Car not found' });
//         }

//         // Emit bid update to clients all and car details room
//         SocketService.broadcast(EVENTS.BID_UPDATED, { carId, highestBid: newBidAmount, userId });
//         SocketService.emitToRoom(`car-${carId}`, EVENTS.BID_UPDATED, { carId, highestBid: newBidAmount, userId });


//         return res.json({ success: true, highestBid: newBidAmount });
//     } catch (error) {
//         console.error('Error updating bid:', error);
//         res.status(500).json({ error: 'Failed to update bid' });
//     }
// };


// Update auction time
exports.updateAuctionTime = async (req, res) => {
    try {
        const { carId, auctionStartTime, auctionDuration } = req.body;

        if (!carId) {
            return res.status(400).json({ error: 'carId is required' });
        }

        const updateData = {};
        let startTimeToUse = null;

        // Set auctionStartTime if provided
        if (auctionStartTime) {
            const parsedStart = new Date(auctionStartTime);
            updateData.auctionStartTime = parsedStart;
            startTimeToUse = parsedStart;
        }

        // Set auctionDuration if provided
        if (auctionDuration !== undefined) {
            updateData.auctionDuration = auctionDuration;
        }

        // If either startTime or duration is being updated, calculate auctionEndTime
        if ((auctionStartTime || auctionDuration !== undefined)) {
            // Get current car data to fill missing value if one is not provided
            const car = await CarModel.findById(carId);
            if (!car) return res.status(404).json({ error: 'Car not found' });

            const finalStartTime = startTimeToUse || car.auctionStartTime;
            const finalDuration = auctionDuration !== undefined ? auctionDuration : car.auctionDuration;

            if (finalStartTime && finalDuration !== undefined) {
                const endTime = new Date(new Date(finalStartTime).getTime() + finalDuration * 3600000);
                updateData.auctionEndTime = endTime;
            }
        }

        // ✅ Force auction status to "live" when updating
        updateData.auctionStatus = CONSTANTS.AUCTION_STATUS.LIVE;

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const updatedCar = await CarModel.findByIdAndUpdate(
            carId,
            updateData,
            { new: true }
        );

        if (!updatedCar) {
            return res.status(404).json({ error: 'Car not found' });
        }

        // emit to that car room
        SocketService.emitToRoom(
            EVENTS.AUCTION_TIMER_ROOM,
            EVENTS.AUCTION_TIMER_UPDATED,
            {
                carId: updatedCar._id.toString(),
                auctionStartTime: updatedCar.auctionStartTime,
                auctionEndTime: updatedCar.auctionEndTime,
                auctionDuration: updatedCar.auctionDuration,
                auctionStatus: updatedCar.auctionStatus
            }
        );

        // Tell the ui that a new car is added in the live bids section
        const { addCarToLiveBidsHelper } = require('../Helper Functions/add_car_to_live_bids_helper');
        const addedCar = addCarToLiveBidsHelper(updatedCar);

        SocketService.emitToRoom(EVENTS.LIVE_BIDS_SECTION_ROOM, EVENTS.LIVE_BIDS_SECTION_UPDATED, {
            action: 'added',
            id: updatedCar._id.toString(),
            car: addedCar,
            message: 'Car added to live bids section',
        });


        // ✅ Just one line to schedule
        // const AgendaJobs = require('../Config/dummy_agenda_jobs');
        // await AgendaJobs.scheduleAuctionEnd(updatedCar._id.toString(), updatedCar.auctionEndTime);
        const AgendaJobs = require('../Agenda/Agenda Jobs/schedule_auction_end_time_for_update_auction_time_api');
        await AgendaJobs.scheduleAuctionEndForUpdateAuctionTimeApi(updatedCar._id.toString(), updatedCar.auctionEndTime);


        res.json({ success: true, data: updatedCar });
    } catch (error) {
        console.error('Update error:', error);
        res.status(500).json({ error: 'Failed to update car fields' });
    }
};


// Check highest bidder
exports.checkHighestBidder = async (req, res) => {
    try {
        const { carId, userId } = req.body;

        // Validate input
        if (!carId || !userId) {
            return res.status(400).json({ error: 'carId and userId are required' });
        }

        // Get the highest bid for the car
        const highestBid = await BidModel.findOne({ carId })
            .sort({ bidAmount: -1, time: 1 }) // Highest first, then oldest if tie
            .limit(1);

        if (!highestBid) {
            return res.json({ isHighestBidder: false });
        }

        const isHighestBidder = highestBid.userId === userId;

        return res.json({ isHighestBidder });
    } catch (err) {
        console.error('Error in checkHighestBidder:', err);
        res.status(500).json({ error: 'Server error' });
    }
};




// Add multiple cars in upcoming section
exports.addCar = async (req, res) => {
    try {
        const carsList = req.body;
        if (!Array.isArray(carsList)) {
            return res.status(400).json({ error: "carsList (array) is required" });
        }

        // ✅ Make everything match CarModel (dates → UTC assuming India, numbers, strings, arrays)
        const modelSetCarsList = setCarFieldsAccordingToCarModel(CarModel, carsList, {
            dateZone: "Asia/Kolkata",
        });

        // // ✅ Normalize auction/upcoming fields once here
        // // const defaultFieldsSetCarsList = normalizeAuctionFields(modelSetCarsList);

        // ✅ Replace images paths with Drive URLs
        const driveConvertedList = await replaceFilePathsWithDriveUrls(modelSetCarsList);

        // ✅ Convert images from Google Drive URLs to Cloudinary URLs
        const cloudinaryConvertedList = await convertImagesToCloudinary(driveConvertedList);

        // ✅ Set auction times like (upcomingUntil, auctionStartTime, auctionEndTime) etc.
        const defaultFieldsSetCarsList = setAuctionTimes(cloudinaryConvertedList, {
            upcomingMinutesDefault: 10,
            durationHoursDefault: 24,
            // now: new Date(), // optional injection for testing
        });

        // ✅ Store in MongoDB
        const finalMongoDBUploadedCarsList = await CarModel.insertMany(defaultFieldsSetCarsList);
        console.log('Data import completed successfully');

        // ✅ Schedule Agenda jobs for upcoming cars
        const scheduledJobs = await scheduleJobsForUpcomingCars(finalMongoDBUploadedCarsList);


        return res.status(200).json({
            message: 'File processed, typed and stored in Mongodb successfully',
            totalRecords: finalMongoDBUploadedCarsList.length,
            scheduledJobs,
            data: finalMongoDBUploadedCarsList,
        });
    } catch (e) {
        console.error('Error adding car:', e);
        res.status(500).json({ error: 'Failed to add car', e });
    }
};



// Remove cars from upcoming section
exports.removeCar = async (req, res) => {
    try {
        const { carId, reasonOfRemoval, removedBy } = req.body;

        // Basic validation
        if (!carId || !reasonOfRemoval || !removedBy) {
            return res.status(400).json({
                error: 'carId, reasonOfRemoval and removedBy are required',
            });
        }

        // Prepare update
        const update = {
            auctionStatus: CONSTANTS.AUCTION_STATUS.REMOVED,
            reasonOfRemoval,
            removedBy,
        };

        // Update the car
        const car = await CarModel.findByIdAndUpdate(
            carId,
            { $set: update },
            { new: true, runValidators: true } // return updated doc, respect schema validators
        );

        if (!car) {
            return res.status(404).json({ error: 'Car not found' });
        }

        // Cancel Agenda jobs if exists
        const agenda = getAgenda();
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_UPCOMING_TO_LIVE, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.START_LIVE_AUCTION, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.END_LIVE_AUCTION, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_OTOBUY_TO_AUCTION_COMPLETED, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_EVERY_SIX_HOURS_IF_CAR_IS_LIVE, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE, 'data.carId': carId.toString() });


        // Emit to remove from rooms
        SocketService.emitToRoom(EVENTS.UPCOMING_BIDS_SECTION_ROOM, EVENTS.UPCOMING_BIDS_SECTION_UPDATED, {
            action: 'removed',
            id: car._id.toString(),
            message: 'Car removed from upcoming section',
        });
        SocketService.emitToRoom(EVENTS.LIVE_BIDS_SECTION_ROOM, EVENTS.LIVE_BIDS_SECTION_UPDATED, {
            action: 'removed',
            id: car._id.toString(),
            message: 'Car removed from live section',
        });
        SocketService.emitToRoom(EVENTS.AUCTION_COMPLETED_CARS_SECTION_ROOM, EVENTS.AUCTION_COMPLETED_CARS_SECTION_UPDATED, {
            action: 'removed',
            id: car._id.toString(),
            message: 'Car removed from completed section',
        });
        SocketService.emitToRoom(EVENTS.OTOBUY_CARS_SECTION_ROOM, EVENTS.OTOBUY_CARS_SECTION_UPDATED, {
            action: 'removed',
            id: car._id.toString(),
            message: 'Car removed from otobuy section',
        });

        // Notify customer that his car has been removed from listing
        const customerId = await getCustomerIdByPhoneNumber(car.contactNumber);
        if (customerId) {
            const getYearOnly = (value) => {
                if (!value) return '';
                const d = new Date(value);
                if (Number.isNaN(d.getTime())) return '';
                return String(d.getUTCFullYear()); // use UTC to avoid timezone shifting
            };
            const manufactureYear = getYearOnly(car.yearMonthOfManufacture);
            const make = car.make || '';
            const model = car.model || '';
            const variant = car.variant || '';

            await sendPushToExternalId({
                externalId: customerId,
                title: `Car Removed From Listing`,
                body: `Your car (${manufactureYear} ${make} ${model} ${variant}) has been removed from listing. You can relist anytime with a new request.`,
                data: {},
            });
        } else {
            console.warn(`[Push] No user found for car.contactNumber=${car.contactNumber}. Skipping customer push.`);
        }

        return res.status(200).json({
            message: 'Car removed successfully',
            car,
        });



    } catch (e) {
        console.error('Error removing car:', e);
        return res.status(500).json({ error: 'Failed to remove car' });
    }
};

// Get cars list model for a car
exports.getCarsListModelForACar = async (req, res) => {
    try {
        const { carId } = req.body;
        if (!carId) {
            return res.status(400).json({ error: 'carId is required' });
        }

        const car = await CarModel.findById(carId).lean();
        if (!car) {
            return res.status(404).json({ error: 'Car not found' });
        }

        const carsListModel = CarDetailsForCarsListModel.setCarDetails(car);
        return res.status(200).json({ carsListModel });

    } catch (e) {
        console.error('Error getting car details:', e);
        return res.status(500).json({ error: 'Failed to get car details' });
    }
};


// Get car auction status and remaining time
exports.getCarAuctionStatusAndRemainingTime = async (req, res) => {
    try {
        const { carId } = req.body;
        if (!carId) {
            return res.status(400).json({ error: 'carId is required' });
        }

        const car = await CarModel.findById(carId).select('auctionStatus upcomingUntil auctionEndTime liveAt')
        if (!car) {
            return res.status(404).json({ error: 'Car not found' });
        }

        const auctionStatus = car.auctionStatus;
        const remainingTime = auctionStatus === CONSTANTS.AUCTION_STATUS.UPCOMING ? car.upcomingUntil : auctionStatus === CONSTANTS.AUCTION_STATUS.LIVE ? car.auctionEndTime : car.liveAt;
        return res.status(200).json({ auctionStatus, remainingTime });

    } catch (e) {
        console.error('Error getting car auction status and remaining time:', e);
        return res.status(500).json({ error: 'Failed to get car auction status and remaining time' });
    }
};


// Reject a car
exports.rejectACar = async (req, res) => {
    try {
        const { carId, userId, reason } = req.body;

        if (!carId) {
            return res.status(400).json({
                success: false,
                message: 'carId is required'
            });
        }

        // 1. Find car by ObjectId
        const car = await CarModel.findById(carId);

        if (!car) {
            return res.status(404).json({
                success: false,
                message: 'Car not found'
            });
        }

        // 2. Get appointmentId from car document
        const appointmentId = car.appointmentId;

        // 3. Update car document
        car.approvalStatus = 'Rejected';
        car.remarks = reason || '';
        await car.save();

        // 4. Find telecalling document using appointmentId
        let telecallingDoc = await TelecallingsModel.findOne({ appointmentId });

        // 5. If telecalling doc does not exist, create one
        if (!telecallingDoc) {
            telecallingDoc = await TelecallingsModel.create({
                appointmentId,
                inspectionStatus: 'Rejected',
                remarks: reason || '',
                carRegistrationNumber: car.registrationNumber,
                ownerName: car.registeredOwner,
                yearOfRegistration: car.registrationDate.getFullYear(),
                ownershipSerialNumber: car.ownershipSerialNo,
                make: car.make,
                model: car.model,
                variant: car.variant,
   
                odometerReadingInKms: car.odometer,
                additionalNotes: car.additionalNotes,
                customerContactNumber: car.contactNumber,
                city: car.city,
                yearOfManufacture: car.manufacturingDate.getFullYear(),
                priority: 'High',
                createdBy: userId,
                addedBy: CONSTANTS.USER_ROLES.QC,
            });
        } else {
            // 6. Update existing telecalling doc
            telecallingDoc.inspectionStatus = 'Rejected';
            telecallingDoc.remarks = reason || '';

            await telecallingDoc.save();
        }

        // 7. Get inspectionEngineerNumber
        const inspectionEngineerNumber =
            telecallingDoc.inspectionEngineerNumber || null;

        // Notify inspection engineer
      try{
        const inspectionEngineerId = await getUserIdByPhoneNumber(inspectionEngineerNumber);
        await sendPushToExternalId({
          externalId: inspectionEngineerId,
          title: `${car.make} ${car.model} is rejected from QC.`,
          body: `Reason: ${reason || 'No reason provided'}`,
          data: {},
        });
        }catch(error){
        console.error('[Push] Error notifying inspection engineer:', error);
        }

        return res.status(200).json({
            success: true,
            message: 'Car successfully marked as rejected.',
            inspectionEngineerNumber
        });

    } catch (error) {
        console.error('rejectACar:', error);

        return res.status(500).json({
            success: false,
            message: error.message || 'Internal Server Error'
        });
    }
};



// ---- THIN DELEGATORS (keep your current endpoints unchanged) ----
exports.updateBid = (req, res) => AuctionController.updateBid(req, res);
exports.submitAutoBidForLiveSection = (req, res) => AuctionController.submitAutoBidForLiveSection(req, res);