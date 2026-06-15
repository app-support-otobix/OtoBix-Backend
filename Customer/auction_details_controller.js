// customer/auction_details_controller.js

const CarModel = require('../Models/carModel');
const BidModel = require('../Models/bidModel');
const OtobuyOffersModel = require('../Models/otobuyOffersModel');
const SoldCarsModel = require('../Models/soldCarsModel');
const SocketService = require('../Config/socket_service');
const EVENTS = require('../Sockets/socket_events');
const CONSTANTS = require('../Utils/constants');
const UserModel = require('../Models/userModel');
const { notifyCustomerAndBiddersOnExpectedPriceUpdate } = require('../Helper Functions/auction_details_notification_helpers');
const { getCustomerIdByPhoneNumber } = require('../Helper Functions/external_id_extraction_helpers');
const { sendPushToExternalId } = require('../Helper Functions/send_notification_helpers');
const { calculateCustomerNetAmountAfterMarginAdjustment, roundDownToPrevious1000 } = require('../Helper Functions/margin_set_amount_helpers');
const ReAuctionRequestsModel = require("../Models/reAuctionRequestsModel");
const { uploadSingleImage } = require("../Helper Functions/cloudinary_image_upload_helper");
require("dotenv").config();


// ======================= Fetch Auction Car Details =======================
exports.fetchAuctionDetails = async (req, res) => {
    const { appointmentId } = req.body;


    if (!appointmentId) {
        return res.status(400).json({
            success: false,
            message: 'Appointment ID is required.',
        });
    }

    try {
        // Fetch the car details based on the appointmentId
        const carDetails = await CarModel.findOne({ appointmentId }).exec();

        if (!carDetails) {
            return res.status(404).json({
                success: false,
                message: 'Car not found.',
            });
        }

        // Fetch bids for the car from the Bids collection
        const bids = await BidModel.find({ carId: carDetails._id })
            .select('userId time bidAmount fixedMargin variableMargin')
            .sort({ time: -1 }) // Sort bids by date (latest first)
            .exec();

        const bidsList = bids.map(bid => ({
            offerBy: bid.userId,
            date: bid.time,
            amount: bid.bidAmount,
            fixedMargin: bid.fixedMargin,
            variableMargin: bid.variableMargin,
        }));

        // Fetch otobuy offers for the car from the OtobuyOffers collection
        const offers = await OtobuyOffersModel.find({ carId: carDetails._id })
            .select('userId offerAt otobuyOffer fixedMargin variableMargin')
            .sort({ offerAt: -1 }) // Sort offers by date (latest first)
            .exec();

        const otobuyOffersList = offers.map(offer => ({
            offerBy: offer.userId,
            date: offer.offerAt,
            amount: offer.otobuyOffer,
            fixedMargin: offer.fixedMargin,
            variableMargin: offer.variableMargin,
        }));

        // Prepare the response data
        const auctionDetails = {
            carId: carDetails._id,
            auctionStatus: carDetails.auctionStatus,
            frontMainImage: carDetails.frontMain[0], // Assuming this is the main image
            registrationNumber: carDetails.registrationNumber,
            make: carDetails.make,
            model: carDetails.model,
            variant: carDetails.variant,
            registrationDate: carDetails.registrationDate,
            yearOfManufacture: carDetails.yearMonthOfManufacture,
            upcomingUntil: carDetails.upcomingUntil,
            auctionEndTime: carDetails.auctionEndTime,
            liveBids: bidsList,
            otobuyOffers: otobuyOffersList,
            oneClickPrice: carDetails.oneClickPrice,
            priceDiscovery: carDetails.priceDiscovery,
            customerExpectedPrice: carDetails.customerExpectedPrice,
            movedToOtobuyAt: carDetails.movedToOtobuyAt,
            registeredOwner: carDetails.registeredOwner,
            ownerSerialNumber: carDetails.ownerSerialNumber,
            retailAssociateContactNumber: carDetails.retailAssociateContactNumber,
        };


        // Return the data in the response
        return res.status(200).json({
            success: true,
            message: 'Auction details fetched successfully.',
            data: auctionDetails,
        });
    } catch (error) {
        console.error('Error fetching auction details:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.',
            error: error.message,
        });
    }
};



// ======================= Set Customer Expected Price =======================
exports.setCustomerExpectedPrice = async (req, res) => {
    const { carId, customerExpectedPrice } = req.body;


    // Validate input
    if (!carId || !customerExpectedPrice) {
        return res.status(400).json({
            success: false,
            message: 'Car ID and Expected Price are required.',
        });
    }

    try {
        // Perform the update without fetching the updated document
        const updateResult = await CarModel.updateOne(
            { _id: carId },
            { $set: { customerExpectedPrice: customerExpectedPrice } }
        ).exec();

        // Check if any document was updated
        if (updateResult.nModified === 0) {
            return res.status(404).json({
                success: false,
                message: 'Car not found or no changes made.',
            });
        }

        const car = await CarModel.findById(carId).select('variableMargin').lean();
        const currentVariableMargin = parseFloat(car.variableMargin || 0);


        // Broadcast the updated expected price to all clients
        SocketService.broadcast(EVENTS.CUSTOMER_EXPECTED_PRICE_UPDATED, {
            carId,
            newCustomerExpectedPrice: customerExpectedPrice,
            newVariableMargin: currentVariableMargin
        });

        // Send Notification to Customer And Bidders
        notifyCustomerAndBiddersOnExpectedPriceUpdate({
            carId,
            newExpectedPrice: customerExpectedPrice,
        }).catch(err => {
            console.error('Notification failed (ignored):', err.message);
        });


        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Expected price updated successfully.',
        });
    } catch (error) {
        console.error('Error updating expected price:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.',
            error: error.message,
        });
    }
};




// Accept offer
exports.acceptOffer = async (req, res) => {
    try {
        const { carId, soldTo, soldBy, soldAt } = req.body;
        if (!carId || !soldTo || !soldBy || !soldAt) return res.status(400).json({ error: 'carId, soldTo, soldBy, and soldAt are required' });

        // 1) Load car
        const car = await CarModel.findById(carId);
        if (!car) return res.status(404).json({ error: 'Car not found' });


        // ✅ save previous status BEFORE changing it
        const previousAuctionStatusWasOtobuy = car.auctionStatus === CONSTANTS.AUCTION_STATUS.OTOBUY;

        // 2) Update car status to SOLD and reflect the chosen offer
        car.auctionStatus = CONSTANTS.AUCTION_STATUS.SOLD;
        car.soldAt = soldAt;
        car.soldTo = soldTo;
        await car.save();

        // ✅ LOOKUP BUYER NAME (MINIMAL CHANGE)
        const buyer = await UserModel.findById(soldTo).select('userName').lean();
        const soldToName = buyer?.userName || 'Unknown Dealer';

        // 3) Add doc in soldCars collection
        const oneClickPrice = Number(car.oneClickPrice) || 0;
        await SoldCarsModel.findOneAndUpdate(
            { carId: car._id.toString() },
            {
                $set: {
                    userId: soldTo,
                    oneClickPrice,
                    highestBid: car.highestBid,
                    soldAt,
                    soldTo,
                    soldBy,
                },
                $setOnInsert: { boughtAt: new Date() }
            },
            { upsert: true, new: true }
        );

        // 4) Notify clients that car is removed from live or otobuy
        SocketService.emitToRoom(EVENTS.LIVE_BIDS_SECTION_ROOM, EVENTS.LIVE_BIDS_SECTION_UPDATED, {
            action: 'removed',
            id: car._id.toString(),
        });
        SocketService.emitToRoom(EVENTS.OTOBUY_CARS_SECTION_ROOM, EVENTS.OTOBUY_CARS_SECTION_UPDATED, {
            action: 'removed',
            id: car._id.toString(),
        });
        SocketService.emitToRoom(
            EVENTS.OTOBUY_CARS_SECTION_ROOM,
            EVENTS.OTOBUY_CARS_SECTION_UPDATED,
            {
                action: 'sold', id: car._id.toString(),
                soldAt,
                soldTo,
                soldToName,   // ✅ name for UI
            }
        );


        // Notify customer that a otobuy offer has been accepted for his car
        const customerId = await getCustomerIdByPhoneNumber(car.contactNumber);
        if (customerId) {
            const otobuyText = previousAuctionStatusWasOtobuy ? 'OtoBuy ' : '';
            const soldAtAmountAfterMarginAdjustment = calculateCustomerNetAmountAfterMarginAdjustment({
                grossAmount: soldAt,
                fixedPercent: car.fixedMargin,
                variablePercent: car.variableMargin,
            });
            await sendPushToExternalId({
                externalId: customerId,
                title: `${otobuyText}Offer Accepted`,
                body: `🎉 “Congratulations!  The ${otobuyText}offer of ₹${roundDownToPrevious1000(soldAtAmountAfterMarginAdjustment).toLocaleString('en-IN')}/- has been accepted for your car ${car.make} ${car.model}. Our team will contact you.`,
                data: {},
            });
        } else {
            console.warn(`[Push] No user found for car.contactNumber=${car.contactNumber}. Skipping customer push.`);
        }

        return res.json({ success: true, data: { carId: car._id.toString(), buyerId: soldTo, price: soldAt } });
    } catch (error) {
        console.error('Mark as sold error:', error);
        return res.status(500).json({ error: 'Failed to mark car as sold' });
    }
};




// ======================= Set One Click Price =======================
exports.setOneClickPrice = async (req, res) => {
    const { carId, oneClickPrice } = req.body;


    // Validate input
    if (!carId || !oneClickPrice) {
        return res.status(400).json({
            success: false,
            message: 'Car ID and One Click Price are required.',
        });
    }

    try {
        // Perform the update without fetching the updated document
        const updateResult = await CarModel.updateOne(
            { _id: carId },
            { $set: { oneClickPrice: oneClickPrice } }
        ).exec();

        // Check if any document was updated
        if (updateResult.nModified === 0) {
            return res.status(404).json({
                success: false,
                message: 'Car not found or no changes made.',
            });
        }

        // Broadcast the updated one click price to all clients
        SocketService.broadcast(EVENTS.CUSTOMER_ONE_CLICK_PRICE_UPDATED, { carId, newCustomerOneClickPrice: oneClickPrice });

        // Return success response
        return res.status(200).json({
            success: true,
            message: 'One Click Price updated successfully.',
        });
    } catch (error) {
        console.error('Error updating one click price:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error.',
            error: error.message,
        });
    }
};





// ======================= Submit Re-Auction Request =======================
exports.submitReAuctionRequest = async (req, res) => {
    try {
        const file = req.file; // because route uses uploadImages.single("image")

        const {
            carId,
            appointmentId,
            odometerReading,
            ownerName,
            make,
            model,
            variant,
            customerContactNumber,
        } = req.body;

        const missing = [];
        if (!carId) missing.push("carId");
        if (!appointmentId) missing.push("appointmentId");
        if (odometerReading === undefined || odometerReading === null || odometerReading === "")
            missing.push("odometerReading");
        if (!ownerName) missing.push("ownerName");
        if (!make) missing.push("make");
        if (!model) missing.push("model");
        if (!variant) missing.push("variant");

        if (missing.length) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missing.join(", ")}`,
            });
        }

        const cleanAppointmentId = String(appointmentId).trim();

        // Check existing
        const existing = await ReAuctionRequestsModel.findOne({ appointmentId: cleanAppointmentId }).lean();

        // If new request, image must be provided
        if (!existing && !file) {
            return res.status(400).json({
                success: false,
                message: "Image is required for a new re-auction request.",
            });
        }

        // Upload image if provided (if update without new image, keep old)
        let odometerProofImageUrl = existing?.odometerProofImageUrl || "";
        let odometerProofImagePublicId = existing?.odometerProofImagePublicId || "";

        if (file) {
            const folder = `${process.env.CLOUDINARY_PARENT_FOLDER}/Car Images/${cleanAppointmentId}`;
            const uploaded = await uploadSingleImage({
                file,
                folder,
                // optional custom id:
                // fileId: `odometer_${Date.now()}`,
                compress: true,
            });

            odometerProofImageUrl = uploaded.url;
            odometerProofImagePublicId = uploaded.publicId;
        }

        const payload = {
            carId: String(carId).trim(),
            appointmentId: cleanAppointmentId,
            odometerReading: Number(odometerReading),

            odometerProofImageUrl,
            // If you want, add this field in schema:
            // odometerProofImagePublicId: odometerProofImagePublicId,

            ownerName: String(ownerName).trim(),
            make: String(make).trim(),
            model: String(model).trim(),
            variant: String(variant).trim(),
            customerContactNumber: (customerContactNumber || "").toString().trim(),
        };

        let doc;
        if (existing) {
            doc = await ReAuctionRequestsModel.findOneAndUpdate(
                { appointmentId: cleanAppointmentId },
                { $set: payload },
                { new: true, runValidators: true }
            );
        } else {
            doc = await ReAuctionRequestsModel.create(payload);
        }

        return res.status(200).json({
            success: true,
            message: existing
                ? "Re-auction request updated successfully."
                : "Re-auction request submitted successfully.",
            data: doc,
        });
    } catch (error) {
        console.error("Error submitting re-auction request:", error);

        if (error?.code === 11000) {
            const key = Object.keys(error.keyPattern || {})[0] || "field";
            return res.status(409).json({
                success: false,
                message: `Duplicate value for ${key}.`,
                error: error.message,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error.",
            error: error.message,
        });
    }
};
