// controllers/otobuy_controller.js
const CONSTANTS = require('../Utils/constants');
const Car = require('../Models/carModel');
const SocketService = require('../Config/socket_service');
const EVENTS = require('../Sockets/socket_events');
const CarDetailsForCarsListModel = require('../Shared/car_details_for_cars_list_model');
const SoldCarsModel = require('../Models/soldCarsModel');
const OtobuyOffersModel = require('../Models/otobuyOffersModel');
const NotificationsModel = require('../Models/userNotificationsModel');
const { sendPushToExternalId, sendPushToAllDealers } = require('../Helper Functions/send_notification_helpers');
const UserModel = require('../Models/userModel');
const { safeAddPurchasedCar } = require('../Helper Functions/purchased_cars_helpers');
const { getCustomerIdByPhoneNumber } = require('../Helper Functions/external_id_extraction_helpers');
const { scheduleMoveCarFromOtobuyToAuctionCompleted } = require('../Agenda/Agenda Jobs/move_car_from_auction_completed_to_otobuy_job');
const { getIncreasedMarginAmount } = require('../Helper Functions/margin_set_amount_helpers');
const { getAgenda } = require('../Agenda/agenda');

exports.moveCarToOtobuy = async (req, res) => {
    try {
        const { carId, oneClickPrice } = req.body;

        if (!carId) {
            return res.status(400).json({ error: 'carId is required' });
        }

        const now = new Date(); // ✅ stored as UTC in Mongo

        const updatedCar = await Car.findByIdAndUpdate(
            carId,
            // { auctionStatus: CONSTANTS.AUCTION_STATUS.OTOBUY, oneClickPrice: oneClickPrice },
            // { new: true }
            {
                $set: {
                    auctionStatus: CONSTANTS.AUCTION_STATUS.OTOBUY,
                    oneClickPrice: oneClickPrice,
                    movedToOtobuyAt: now,
                },
            },
            { new: true }
        );


        if (!updatedCar) {
            return res.status(404).json({ error: 'Car not found' });
        }

        const listing = CarDetailsForCarsListModel.setCarDetails(updatedCar);
        
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
            id: updatedCar._id.toString(),
            message: 'Car removed from upcoming section',
        });
        SocketService.emitToRoom(EVENTS.LIVE_BIDS_SECTION_ROOM, EVENTS.LIVE_BIDS_SECTION_UPDATED, {
            action: 'removed',
            id: updatedCar._id.toString(),
            message: 'Car removed from live section',
        });
        SocketService.emitToRoom(EVENTS.AUCTION_COMPLETED_CARS_SECTION_ROOM, EVENTS.AUCTION_COMPLETED_CARS_SECTION_UPDATED, {
            action: 'removed',
            id: updatedCar._id.toString(),
            message: 'Car removed from completed section',
        });
        SocketService.emitToRoom(EVENTS.OTOBUY_CARS_SECTION_ROOM, EVENTS.OTOBUY_CARS_SECTION_UPDATED, {
            action: 'added',
            id: updatedCar._id.toString(),
            oneClickPrice: oneClickPrice,
            car: listing,
        });


        // Send push notification to all users 
        await sendPushToAllDealers({
            title: 'New Car in Otobuy 🚘',
            body: `${updatedCar.make} ${updatedCar.model} is now available for instant buying or offers!`,
            data: {
                carId: updatedCar._id.toString(),
                screen: 'otobuy', // direct the app to open Otobuy tab
                navigateToScreen: CONSTANTS.NOTIFICATION_ROUTES.CAR_ADDED_IN_OTOBUY,
                parametersForScreen: {
                    carId: updatedCar._id.toString(),
                    currentOpenSection: CONSTANTS.HOME_SCREEN_SECTIONS.OTOBUY_SECTION_SCREEN,
                }
            },
        });


        // Schedule move to completed auctions job only if 15 days have NOT passed since auction ended
        if (updatedCar.auctionEndTime) {
            const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000; // 15 days in milliseconds
            const endMs = new Date(updatedCar.auctionEndTime).getTime(); // Auction end time in milliseconds
            const diffMs = now.getTime() - endMs; // Difference in milliseconds
            if (diffMs < FIFTEEN_DAYS_MS) {
                await scheduleMoveCarFromOtobuyToAuctionCompleted(agenda, updatedCar._id, now, 3);
            }
        }




        return res.json({ success: true, data: updatedCar });
    } catch (error) {
        console.error('Move car to otobuy error:', error);
        return res.status(500).json({ error: 'Failed to move car to otobuy' });
    }
};


// Buy car using one click buy
exports.buyCar = async (req, res) => {
    try {
        const { carId, userId } = req.body;

        if (!carId || !userId) {
            return res.status(400).json({ error: 'carId and userId are required' });
        }

        // Get car instance first to read oneClickPrice
        const carToGetOneClickPrice = await Car.findById(carId).select('oneClickPrice make model variant');
        if (!carToGetOneClickPrice) {
            return res.status(404).json({ error: 'Car not found' });
        }

        const updatedCar = await Car.findByIdAndUpdate(
            carId,
            {
                auctionStatus: CONSTANTS.AUCTION_STATUS.SOLD,
                soldAt: carToGetOneClickPrice.oneClickPrice ?? 0,
                soldTo: userId
            },
            { new: true }
        );


        if (!updatedCar) {
            return res.status(404).json({ error: 'Car not found' });
        }

        const soldTo = userId;
        const soldBy = userId;

        // ✅ LOOKUP BUYER NAME (MINIMAL CHANGE)
        const buyer = await UserModel.findById(soldTo).select('userName').lean();
        const soldToName = buyer?.userName || 'Unknown Dealer';

        // Save sold record 
        await SoldCarsModel.findOneAndUpdate(
            { carId: updatedCar._id.toString() },
            {
                $set: {
                    userId,
                    oneClickPrice: updatedCar.oneClickPrice ?? 0,
                    highestBid: updatedCar.highestBid ?? 0,
                    soldAt: updatedCar.oneClickPrice ?? 0,
                    boughtAt: Date.now(),
                    soldTo,
                    soldBy,
                },
            },
            { upsert: true, new: true }
        );

        // Add to user model's purchased cars array
        await safeAddPurchasedCar({ userId: soldTo, carId: updatedCar._id.toString() });

        const now = new Date();
        const carName = `${carToGetOneClickPrice.make} ${carToGetOneClickPrice.model}`;
        const soldPrice = updatedCar.oneClickPrice ?? 0;

        // ===========================================
        // 🔹 1) Notify the BUYER
        // ===========================================
        const increasedMarginPrice = getIncreasedMarginAmount({
            amount: updatedCar.oneClickPrice,
            fixedMargin: updatedCar.fixedMargin,
            variableMargin: updatedCar.variableMargin
        });
        const buyerTitle = 'Purchase Successful! 🎉';
        const buyerBody = `You’ve successfully purchased ${carName} for ₹${increasedMarginPrice.toLocaleString('en-IN')}.`;
        const buyerData = {
            type: 'otobuy_purchase_success',
            carId: updatedCar._id.toString(),
            carName,
            soldAt: increasedMarginPrice,
        };

        // Push
        await sendPushToExternalId({
            externalId: userId,
            title: buyerTitle,
            body: buyerBody,
            data: buyerData,
        });

        // In-app DB record
        const buyerDoc = await NotificationsModel.create({
            userId,
            type: 'otobuy_purchase_success',
            title: buyerTitle,
            body: buyerBody,
            isRead: false,
            createdAt: now,
            data: buyerData,
            isGlobal: false,
        });

        // Count unread
        const buyerUnread = await NotificationsModel.countDocuments({
            userId,
            isRead: false,
        });

        // Socket emit to buyer
        SocketService.emitToRoom(
            `${EVENTS.USER_NOTIFICATIONS_ROOM}${userId}`,
            EVENTS.USER_NOTIFICATION_CREATED,
            {
                item: {
                    _id: buyerDoc._id,
                    userId: buyerDoc.userId,
                    title: buyerDoc.title,
                    body: buyerDoc.body,
                    type: buyerDoc.type,
                    data: buyerDoc.data,
                    isRead: buyerDoc.isRead,
                    createdAt: buyerDoc.createdAt,
                },
                unreadNotificationsCount: buyerUnread,
            }
        );

        // ===========================================
        // 🔹 2) Notify all OTHER offer-makers
        // ===========================================
        const allOffers = await OtobuyOffersModel.distinct('userId', { carId });
        const otherOfferMakers = allOffers.filter(
            (uid) => uid.toString() !== userId.toString()
        );

        if (otherOfferMakers.length > 0) {
            const now = new Date();
            const title = 'Car Sold via One-Click Buy 🚘';
            const body = `${carToGetOneClickPrice.make} ${carToGetOneClickPrice.model} has been purchased instantly.`;
            const data = {
                type: 'otobuy_car_sold_via_one_click_buy',
                carId: updatedCar._id.toString(),
                carName: `${carToGetOneClickPrice.make} ${carToGetOneClickPrice.model}`,
                soldAt: increasedMarginPrice,
            };

            const docs = [];

            for (const uid of otherOfferMakers) {
                // 1️⃣ Push notification
                await sendPushToExternalId({
                    externalId: uid,
                    title,
                    body,
                    data,
                });

                // 2️⃣ Create DB notification
                const doc = await NotificationsModel.create({
                    userId: uid,
                    type: 'otobuy_car_sold_via_one_click_buy',
                    title,
                    body,
                    isRead: false,
                    createdAt: now,
                    data,
                    isGlobal: false,
                });

                // 3️⃣ Count unread notifications
                const unreadNotificationsCount = await NotificationsModel.countDocuments({
                    userId: uid,
                    isRead: false,
                });

                // 4️⃣ Emit via socket to that user
                SocketService.emitToRoom(
                    `${EVENTS.USER_NOTIFICATIONS_ROOM}${uid}`,
                    EVENTS.USER_NOTIFICATION_CREATED,
                    {
                        item: {
                            _id: doc._id,
                            userId: doc.userId,
                            title: doc.title,
                            body: doc.body,
                            type: doc.type,
                            data: doc.data,
                            isRead: doc.isRead,
                            createdAt: doc.createdAt,
                        },
                        unreadNotificationsCount,
                    }
                );

                docs.push(doc);
            }

            console.log(`Sent 'car sold via ocb' notifications to ${docs.length} users (excluding buyer).`);
        }

        // Notify customer that a otobuy offer has been accepted for his car
        const customerId = await getCustomerIdByPhoneNumber(updatedCar.contactNumber);
        if (customerId) {
            await sendPushToExternalId({
                externalId: customerId,
                title: `OtoBuy Offer Accepted`,
                body: `🎉 “Congratulations!  The OtoBuy offer of ₹${updatedCar.soldAt.toLocaleString('en-IN')}/- has been accepted for your car ${carName}. Our team will contact you.`,
                data: {},
            });
        } else {
            console.warn(`[Push] No user found for car.contactNumber=${updatedCar.contactNumber}. Skipping customer push.`);
        }


        // 🔹 Socket updates for Otobuy list
        SocketService.emitToRoom(EVENTS.OTOBUY_CARS_SECTION_ROOM, EVENTS.OTOBUY_CARS_SECTION_UPDATED, {
            action: 'removed',
            id: updatedCar._id.toString(),
        });
        SocketService.emitToRoom(EVENTS.OTOBUY_CARS_SECTION_ROOM, EVENTS.OTOBUY_CARS_SECTION_UPDATED, {
            action: 'sold',
            id: updatedCar._id.toString(),
            soldAt: updatedCar.oneClickPrice ?? 0,
            soldTo: updatedCar.soldTo,
            soldToName: soldToName,
        });

        return res.json({ success: true, data: updatedCar });
    } catch (error) {
        console.error('Buy car error:', error);
        return res.status(500).json({ error: 'Failed to buy car' });
    }
};



// Make offer for otobuy section
exports.makeOffer = async (req, res) => {
    try {
        const { carId, userId, otobuyOffer } = req.body;

        if (!carId || !userId || !otobuyOffer) {
            return res.status(400).json({ error: 'carId, userId and otobuyOffer are required' });
        }

        const offerGivenByUser = Number(otobuyOffer);

        // Find current highest offer for this car
        const highestDoc = await OtobuyOffersModel.findOne({ carId }).sort({ otobuyOffer: -1 });

        const currentHighestOffer = highestDoc ? highestDoc.otobuyOffer : 0;

        if (offerGivenByUser <= currentHighestOffer) {
            return res.status(404).json({
                error: 'Offer must be higher than current highest offer',
                currentHighestOffer,
            });
        }

        // Update car with latest offer
        const updatedCar = await Car.findByIdAndUpdate(
            carId,
            {
                otobuyOffer: offerGivenByUser,
                // highestBid: offerGivenByUser, 
                // highestBidder: userId 
            },
            { new: true }
        );

        if (!updatedCar) {
            return res.status(404).json({ error: 'Car not found' });
        }

        // 🔹 get user's assigned KAM (if any)
        const user = await UserModel.findById(userId).select('assignedKam').lean();
        const kamId = user?.assignedKam || null;

        // Save offer record
        const savedOffer = await OtobuyOffersModel.create({
            carId: updatedCar._id.toString(),
            userId,
            kamId,
            otobuyOffer: offerGivenByUser,
            offerAt: Date.now(),
        });

        // Tell the ui that a new offer is made
        SocketService.emitToRoom(EVENTS.OTOBUY_CARS_SECTION_ROOM, EVENTS.OTOBUY_CARS_SECTION_UPDATED, {
            action: 'offer-made',
            id: updatedCar._id.toString(),
            otobuyOffer: offerGivenByUser,
            highestBid: offerGivenByUser // Remove this in future when all users update dealer app to version: 2.2.0
        });


        // Broadcast the new offer to all clients e.g. customer
        SocketService.broadcast(EVENTS.OTOBUY_OFFER_UPDATED, {
            carId: updatedCar._id.toString(), 
            newOfferAmmount: offerGivenByUser,
            offerBy: userId, offerTime: new Date(),
            fixedMargin: savedOffer.fixedMargin,   // ✅ from plugin
            variableMargin: savedOffer.variableMargin, // ✅ from plugin 
        });



        // Notify customer that a otobuy offer has recieved on his car
        const customerId = await getCustomerIdByPhoneNumber(updatedCar.contactNumber);
        if (customerId) {
            await sendPushToExternalId({
                externalId: customerId,
                title: `New Offer Received`,
                body: `You have an offer of Rs. ${offerGivenByUser.toLocaleString('en-IN')}/- on your car ${updatedCar.make} ${updatedCar.model}. Accept now and sell your car instantly.`,
                data: {},
            });
        } else {
            console.warn(`[Push] No user found for car.contactNumber=${updatedCar.contactNumber}. Skipping customer push.`);
        }


        // 5️⃣ Notify previous highest bidder (if different user)
        if (highestDoc && highestDoc.userId && highestDoc.userId.toString() !== userId.toString()) {
            const prevBidderId = highestDoc.userId.toString();
            const title = 'Your Offer Has Been Outbid! ⚠️';
            const body = `${updatedCar.make} ${updatedCar.model} has received a higher offer.`;
            const data = {
                type: 'outbid_in_otobuy_section',
                carId: updatedCar._id.toString(),
                carName: `${updatedCar.make} ${updatedCar.model}`,
                prevOffer: currentHighestOffer,
                newOffer: offerGivenByUser,
                navigateToScreen: CONSTANTS.NOTIFICATION_ROUTES.CAR_ADDED_IN_OTOBUY,
                parametersForScreen: {
                    carId: updatedCar._id.toString(),
                    currentOpenSection: CONSTANTS.HOME_SCREEN_SECTIONS.OTOBUY_SECTION_SCREEN,
                }
            };

            // 🔹 1) Push notification
            try{
            await sendPushToExternalId({
                externalId: prevBidderId,
                title,
                body,
                data,
            });
            } catch (error) {
                console.error(`[Push] Failed to send push notification to user ${prevBidderId}:`, error);
            }

            // 🔹 2) In-app notification (store in DB)
            const doc = await NotificationsModel.create({
                userId: prevBidderId,
                type: 'outbid_in_otobuy_section',
                title,
                body,
                isRead: false,
                createdAt: new Date(),
                data,
                isGlobal: false,
            });

            // 🔹 3) Count unread notifications for badge
            const unreadNotificationsCount = await NotificationsModel.countDocuments({
                userId: prevBidderId,
                isRead: false,
            });

            // 🔹 4) Emit socket notification to that specific user
            SocketService.emitToRoom(
                `${EVENTS.USER_NOTIFICATIONS_ROOM}${prevBidderId}`,
                EVENTS.USER_NOTIFICATION_CREATED,
                {
                    item: {
                        _id: doc._id,
                        userId: doc.userId,
                        title: doc.title,
                        body: doc.body,
                        type: doc.type,
                        data: doc.data,
                        isRead: doc.isRead,
                        createdAt: doc.createdAt,
                    },
                    unreadNotificationsCount,
                }
            );
        }

        return res.json({ success: true, data: updatedCar });
    } catch (error) {
        console.error('Make offer error:', error);
        return res.status(500).json({ error: 'Failed to make offer' });
    }
};




// Mark car as sold via admin
exports.markCarAsSold = async (req, res) => {
    try {
        const { carId, soldTo, soldBy, soldAt } = req.body;
        if (!carId || !soldTo || !soldBy || !soldAt) return res.status(400).json({ error: 'carId, soldTo, soldBy, and soldAt are required' });

        // 1) Load car
        const car = await Car.findById(carId);
        if (!car) return res.status(404).json({ error: 'Car not found' });

        // // 2) Get highest offer for this car
        // const topOffer = await OtobuyOffersModel.findOne({ carId }).sort({ otobuyOffer: -1 });
        // if (!topOffer) {
        //     return res.status(404).json({ error: 'No offers found for this car' });
        // }

        // 3) Update car status to SOLD and reflect the chosen offer
        car.auctionStatus = CONSTANTS.AUCTION_STATUS.SOLD; // e.g., 'sold'
        // car.otobuyOffer = soldAt;
        car.soldAt = soldAt;
        car.soldTo = soldTo;
        await car.save();

        // ✅ LOOKUP BUYER NAME (MINIMAL CHANGE)
        const buyer = await UserModel.findById(soldTo).select('userName').lean();
        const soldToName = buyer?.userName || 'Unknown Dealer';

        // 4) Upsert into soldCars (freeze the sale info)
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

        // 5) Add to user model's purchased cars array
        await safeAddPurchasedCar({ userId: soldTo, carId: car._id.toString() });

        // Cancel Agenda jobs if exists
        const agenda = getAgenda();
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_UPCOMING_TO_LIVE, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.START_LIVE_AUCTION, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.END_LIVE_AUCTION, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_OTOBUY_TO_AUCTION_COMPLETED, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_EVERY_SIX_HOURS_IF_CAR_IS_LIVE, 'data.carId': carId.toString() });
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE, 'data.carId': carId.toString() });


        // Emit to remove from rooms : Notify clients
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
            const soldAtAmount = Number(soldAt || 0);
            await sendPushToExternalId({
                externalId: customerId,
                title: `OtoBuy Offer Accepted`,
                body: `🎉 “Congratulations!  The OtoBuy offer of ₹${soldAtAmount.toLocaleString('en-IN')}/- has been accepted for your car ${car.make} ${car.model}. Our team will contact you.`,
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
