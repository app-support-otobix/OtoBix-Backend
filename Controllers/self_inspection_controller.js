// Controllers/self_inspection_controller.js
const SelfInspectedCarsModel = require('../Models/selfInspectedCarsModel');
const { uploadSingleImage, deleteImageFromCloudinary } = require('../Helper Functions/cloudinary_image_upload_helper');
require("dotenv").config();
const CONSTANTS = require('../Utils/constants');
const EVENTS = require('../Sockets/socket_events');
const SocketService = require('../Config/socket_service');
const { getAgenda } = require('../Agenda/agenda');
const { scheduleSelfInspectedCarAuction } = require('../Agenda/Agenda Jobs/schedule_self_inspected_car_auction_job');
const SelfInspectedCarOffersModel = require('../Models/selfInspectedCarOffersModel');
const { getUserIdByPhoneNumber } = require('../Helper Functions/external_id_extraction_helpers');
const NotificationsModel = require('../Models/userNotificationsModel');
const { sendPushToExternalId } = require('../Helper Functions/send_notification_helpers');
const { notifyDealerAndSellerOnExpectedPriceUpdate } = require('../Helper Functions/self_inspected_car_notifications_helper');
const { getDecreasedMarginAmount } = require('../Helper Functions/margin_set_amount_helpers');
const { addTelecalling } = require('../Inspection/telecallings_controller')

// ======================= Submit Self Inspection Request ========================
exports.submitSelfInspectionRequest = async (req, res) => {
    try {
        const {
            // RC Details
            registrationNumber,
            make,
            model,
            variant,
            roadTaxValidity,
            taxValidTill,
            registrationDate,
            fitnessValidity,
            engineNumber,
            chassisNumber,
            manufacturingDate,
            fuelType,
            cubicCapacity,
            registrationState,
            registeredRTO,
            ownershipSerialNo,
            registeredOwner,
            registeredAddressAsPerRC,
            hypothecationDetails,
            financierName,
            insuranceValidity,
            rcStatus,
            blacklistStatus,
            pucValidityDate,
            pucNumber,
            
            // Vehicle Condition
            odometer,
            accidentalStatus,
            clutch,
            suspension,
            steering,
            brake,
            ac,
            
            // Additional Details
            expectedDateOfCarHandover,
            expectedPrice,
            additionalNotes,
            userId,
            sellerContactNumber
        } = req.body;

        // Get uploaded files from multer
        const files = req.files;
        
        // Check if all required images are present
        const requiredImages = [
            'frontMainImage',
            'rhsFullImage', 
            'rearMainImage',
            'bootFloorImage',
            'lhsMainImage',
            'engineBayImage',
            'dashboardImage'
        ];
        
        const missingImages = requiredImages.filter(img => !files[img] || files[img].length === 0);
        
        if (missingImages.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Missing required images: ${missingImages.join(', ')}`
            });
        }

        // Create a unique folder for this inspection
        const timestamp = Date.now();
        const cloudinaryParentFolder = process.env.CLOUDINARY_PARENT_FOLDER; 
        const cloudinaryFolder = `${cloudinaryParentFolder}/Self Inspected Cars Images/${registrationNumber}`;
        
        // Helper function to upload image
        const uploadImageField = async (fileArray, fieldName) => {
            if (!fileArray || fileArray.length === 0) {
                throw new Error(`${fieldName} is required`);
            }
            
            const uploadResult = await uploadSingleImage({
                file: fileArray[0],
                folder: cloudinaryFolder,
                fileId: `${fieldName}_${timestamp}`,
                compress: true
            });
            
            return uploadResult.url;
        };
        
        // Upload all 7 required images
        const [
            frontMainImage,
            rhsFullImage,
            rearMainImage,
            bootFloorImage,
            lhsMainImage,
            engineBayImage,
            dashboardImage
        ] = await Promise.all([
            uploadImageField(files.frontMainImage, 'front_main'),
            uploadImageField(files.rhsFullImage, 'rhs_full'),
            uploadImageField(files.rearMainImage, 'rear_main'),
            uploadImageField(files.bootFloorImage, 'boot_floor'),
            uploadImageField(files.lhsMainImage, 'lhs_main'),
            uploadImageField(files.engineBayImage, 'engine_bay'),
            uploadImageField(files.dashboardImage, 'dashboard')
        ]);
        
        // Prepare data for database matching your model exactly
        const inspectionData = {
            // RC Details
            registrationNumber: registrationNumber.toUpperCase(),
            make,
            model,
            variant,
            roadTaxValidity,
            taxValidTill: taxValidTill ? new Date(taxValidTill) : undefined,
            registrationDate: registrationDate ? new Date(registrationDate) : undefined,
            fitnessValidity: fitnessValidity ? new Date(fitnessValidity) : undefined,
            engineNumber,
            chassisNumber,
            manufacturingDate: manufacturingDate ? new Date(manufacturingDate) : undefined,
            fuelType,
            cubicCapacity: cubicCapacity ? parseInt(cubicCapacity) : 0,
            registrationState,
            registeredRTO,
            ownershipSerialNo: ownershipSerialNo ? parseInt(ownershipSerialNo) : 0,
            registeredOwner,
            registeredAddressAsPerRC,
            hypothecationDetails,
            financierName,
            insuranceValidity: insuranceValidity ? new Date(insuranceValidity) : undefined,
            rcStatus,
            blacklistStatus,
            pucValidityDate: pucValidityDate ? new Date(pucValidityDate) : undefined,
            pucNumber,
            
            // Images
            frontMainImage,
            rhsFullImage,
            rearMainImage,
            bootFloorImage,
            lhsMainImage,
            engineBayImage,
            dashboardImage,
            
            // Vehicle Condition
            odometer: odometer ? parseInt(odometer) : 0,
            accidentalStatus,
            clutch,
            suspension,
            steering,
            brake,
            ac,
            
            // Additional Details
            expectedDateOfCarHandover: expectedDateOfCarHandover ? new Date(expectedDateOfCarHandover) : undefined,
            expectedPrice: expectedPrice ? parseInt(expectedPrice) : 0,
            additionalNotes: additionalNotes || '',
            
            // System Fields
            userId: userId, 
            auctionStatus: 'selfInspectionRequested',
            sellerContactNumber
        };
        
        // Save to database
        const savedInspection = await SelfInspectedCarsModel.create(inspectionData);
        
        console.log("Self inspection request submitted successfully for:", registrationNumber);
        return res.status(200).json({
            success: true,
            message: 'Self inspection request submitted successfully',
            data: {
                inspectionId: savedInspection._id,
                registrationNumber: savedInspection.registrationNumber,
                make: savedInspection.make,
                model: savedInspection.model,
                images: {
                    frontMainImage,
                    rhsFullImage,
                    rearMainImage,
                    bootFloorImage,
                    lhsMainImage,
                    engineBayImage,
                    dashboardImage
                },
                auctionStatus: savedInspection.auctionStatus
            },
        });
        
    } catch (error) {
        console.error("submitSelfInspectionRequest:", error);
        
        // Handle duplicate registration number error
        if (error.code === 11000 && error.keyPattern?.registrationNumber) {
            return res.status(400).json({
                success: false,
                message: 'Vehicle with this registration number already exists',
                error: 'Duplicate registration number'
            });
        }
        
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error",
            error: error?.message || error,
        });
    }
};

// ======================= Get User Self Inspected Cars List ========================
exports.getUserSelfInspectedCarsList = async (req, res) => {
    try {
        const userId = req.query.userId;
        const cars = await SelfInspectedCarsModel.find({ userId })
            .sort({ updatedAt: -1 });
        
        return res.status(200).json({
            success: true,
            message: 'User self inspected cars list fetched successfully',
            count: cars.length,
            data: cars
        });
    } catch (error) {
        console.error("getUserSelfInspectedCarsList:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }
};

// ======================= Get Single Self Inspected Car ========================
exports.getSelfInspectedCarById = async (req, res) => {
    try {
        const carId = req.query.carId;
        const car = await SelfInspectedCarsModel.findOne({
            _id: carId,
        });
        
        if (!car) {
            return res.status(404).json({
                success: false,
                message: 'Self inspected car not found'
            });
        }
        
        return res.status(200).json({
            success: true,
            message: 'Self inspected car details fetched successfully',
            data: car
        });
    } catch (error) {
        console.error("getSelfInspectedCarById:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }
};


// ======================= Get Live Self Inspected Cars List ========================
exports.getLiveSelfInspectedCarsList = async (req, res) => {
    try {
        const { page = 1, limit = 30 } = req.query;

        const pageNum = parseInt(page, 10) || 1;
        const limitNum = parseInt(limit, 10) || 30;
        
        const [cars, total] = await Promise.all([
    SelfInspectedCarsModel.find({
        auctionStatus: CONSTANTS.SELF_INSPECTED_CARS_AUCTION_STATUS.LIVE_FOR_BIDDING
    })
    .lean()
    .sort({ updatedAt: -1 })
    .skip((pageNum - 1) * limitNum)
    .limit(limitNum),

    SelfInspectedCarsModel.countDocuments({
        auctionStatus: CONSTANTS.SELF_INSPECTED_CARS_AUCTION_STATUS.LIVE_FOR_BIDDING
    })
]);
        
        return res.status(200).json({
    success: true,
    message: 'Live self inspected cars list fetched successfully',
    count: cars.length,     // current page count
    total,                  // total records
    page: pageNum,
    totalPages: Math.ceil(total / limitNum),
    data: cars
});
    } catch (error) {
        console.error("getLiveSelfInspectedCarsList:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }
};


// ======================= Make Self Inspected Car Live ========================
exports.makeSelfInspectedCarLive = async (req, res) => {
    try {
        const { carId, auctionEndTime } = req.body;

          if (!carId || !auctionEndTime) {
            return res.status(400).json({
                success: false,
                message: "carId and auctionEndTime are required"
            });
        }

        const currentTime = new Date();
        const parsedEndTime = new Date(auctionEndTime);

        if (isNaN(parsedEndTime.getTime())) {
            return res.status(400).json({
                success: false,
                message: "Invalid auctionEndTime format"
            });
        }

        // Update car auction fields
        const updatedCar = await SelfInspectedCarsModel.findByIdAndUpdate(
            carId,
            {
                auctionStartTime: currentTime,
                auctionEndTime: parsedEndTime,
                auctionStatus: CONSTANTS.SELF_INSPECTED_CARS_AUCTION_STATUS.LIVE_FOR_BIDDING
            },
            { new: true }
        );

        if (!updatedCar) {
            return res.status(404).json({
                success: false,
                message: "Car not found"
            });
        }
       
        // Schedule self inspected car auction after you set auctionStatus to liveForBidding
        const agenda = getAgenda();
        await scheduleSelfInspectedCarAuction(agenda, carId, parsedEndTime);
        
        return res.status(200).json({
            success: true,
            message: 'Auction scheduled for self inspection car',
            });

    } catch (error) {
        console.error("makeSelfInspectedCarLive:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }
};


// Make offer on self inspected car
exports.makeOfferOnSelfInspectedCar = async (req, res) => {
    try {
        const { carId, userId, offerAmount } = req.body;
 
        if (!carId || !userId || !offerAmount) {
            return res.status(400).json({ error: 'carId, userId and offerAmount are required' });
        }

        const offerGivenByUser = Number(offerAmount);

        // Find current highest offer for this car
        const highestOfferDoc = await SelfInspectedCarOffersModel.findOne({ carId }).sort({ offerAmount: -1 });

        const currentHighestOffer = highestOfferDoc ? highestOfferDoc.offerAmount : 0;

        if (offerGivenByUser <= currentHighestOffer) {
            return res.status(400).json({
                success: false,
                message: 'Offer must be higher than current highest offer',
                currentHighestOffer,
            });
        }

        // Update car with latest offer
        const updatedSelfInspectedCar = await SelfInspectedCarsModel.findByIdAndUpdate(
            carId,
            {
                highestOffer: offerGivenByUser,
                highestOfferBy: userId,
            },
            { new: true }
        );

        if (!updatedSelfInspectedCar) {
            return res.status(404).json({ error: 'Car not found' });
        }

        // Save offer record
        const savedOffer = await SelfInspectedCarOffersModel.create({
            carId: updatedSelfInspectedCar._id.toString(),
            userId,
            offerAmount: offerGivenByUser,
        });

        // Tell the ui that a new offer is made
        SocketService.emitToRoom(EVENTS.PD_SECTION_ROOM, EVENTS.SELF_INSPECTED_CAR_OFFER_UPDATED, {
            action: 'offer-made',
            id: updatedSelfInspectedCar._id.toString(),
            offerAmount: offerGivenByUser,
            offerBy: userId,
            fixedMargin: savedOffer.fixedMargin,   // ✅ from plugin
            variableMargin: savedOffer.variableMargin, // ✅ from plugin 
        });
        
        // // Broadcast the new offer to all clients 
        // SocketService.broadcast(EVENTS.SELF_INSPECTED_CAR_OFFER_UPDATED, {
        //     carId: updatedSelfInspectedCar._id.toString(), 
        //     offerAmount: offerGivenByUser,
        //     offerBy: userId,
        //     fixedMargin: savedOffer.fixedMargin,   // ✅ from plugin
        //     variableMargin: savedOffer.variableMargin, // ✅ from plugin 
        // });

        // Notify dealer (seller) that an offer has recieved on his car
        const dealerAsSellerId = await getUserIdByPhoneNumber(updatedSelfInspectedCar.sellerContactNumber);
        if (dealerAsSellerId) {
            await sendPushToExternalId({
                externalId: dealerAsSellerId,
                title: `New Offer Received`,
                body: `You have an offer of Rs. ${offerGivenByUser.toLocaleString('en-IN')}/- on your car ${updatedSelfInspectedCar.make} ${updatedSelfInspectedCar.model}. Accept now and sell your car instantly.`,
                data: {},
            });
        } else {
            console.warn(`[Push] No user found for updatedSelfInspectedCar.sellerContactNumber=${updatedSelfInspectedCar.sellerContactNumber}. Skipping dealer push.`);
        }


        // 5️⃣ Notify previous highest bidder (if different user)
        if (highestOfferDoc && highestOfferDoc.userId && highestOfferDoc.userId.toString() !== userId.toString()) {
            const prevOfferMakerId = highestOfferDoc.userId.toString();
            const title = 'Your Offer Has Been Outbid! ⚠️';
            const body = `${updatedSelfInspectedCar.make} ${updatedSelfInspectedCar.model} has received a higher offer.`;
            const data = {
                type: 'outbid_in_pd_section',
                carId: updatedSelfInspectedCar._id.toString(),
                carName: `${updatedSelfInspectedCar.make} ${updatedSelfInspectedCar.model}`,
                prevOffer: currentHighestOffer,
                newOffer: offerGivenByUser,
                navigateToScreen: CONSTANTS.NOTIFICATION_ROUTES.CAR_ADDED_IN_PD,
                parametersForScreen: {
                    carId: updatedSelfInspectedCar._id.toString(),
                    currentOpenSection: CONSTANTS.HOME_SCREEN_SECTIONS.PD_SECTION_SCREEN,
                }
            };

            // 🔹 1) Push notification
            await sendPushToExternalId({
                externalId: prevOfferMakerId,
                title,
                body,
                data,
            });

            // 🔹 2) In-app notification (store in DB)
            const doc = await NotificationsModel.create({
                userId: prevOfferMakerId,
                type: 'outbid_in_pd_section',
                title,
                body,
                isRead: false,
                createdAt: new Date(),
                data,
                isGlobal: false,
            });

            // 🔹 3) Count unread notifications for badge
            const unreadNotificationsCount = await NotificationsModel.countDocuments({
                userId: prevOfferMakerId,
                isRead: false,
            });

            // 🔹 4) Emit socket notification to that specific user
            SocketService.emitToRoom(
                `${EVENTS.USER_NOTIFICATIONS_ROOM}${prevOfferMakerId}`,
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

        return res.status(200).json({ 
            success: true, 
            message: 'Offer made successfully', 
            // data: updatedSelfInspectedCar 
        });

    } catch (error) {
        console.error("makeOfferOnSelfInspectedCar:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }
};




// Made offer on self inspected car
exports.getPriceOfferedSelfInspectedCarsList = async (req, res) => {
    try {

        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId is required' });
        }

        // Get unique carIds directly from DB
        const carIds = await SelfInspectedCarOffersModel.distinct('carId', { userId });

        return res.status(200).json({ 
            success: true, 
            message: 'Cars fetched successfully', 
            data: carIds 
        });


    } catch (error) {
        console.error("getPriceOfferedSelfInspectedCarsList:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }
};


// ======================= Set Self Inspected Car Expected Price =======================
exports.setSelfInspectedCarExpectedPrice = async (req, res) => {
    const { carId, expectedPrice } = req.body;

    
    // Validate input
    if (!carId || expectedPrice === undefined || expectedPrice === null) {
        return res.status(400).json({
            success: false,
            message: 'Car ID and Expected Price are required.',
        });
    }

    try {

        // Get current expected price
        const carData = await SelfInspectedCarsModel.findById(carId)
            .select('expectedPrice fixedMargin variableMargin')
            .lean();

        if (!carData) {
            return res.status(404).json({
                success: false,
                message: 'Car not found.',
            });
        }

        const currentExpectedPrice = Number(carData.expectedPrice || 0);
        const newExpectedPrice = Number(expectedPrice);

        // If expected price already exists (> 0),
        // then new price must be LOWER than current one
        if (
            currentExpectedPrice > 0 &&
            newExpectedPrice >= currentExpectedPrice
        ) {
            return res.status(400).json({
                success: false,
                message:
                    'You cannot set expected price higher than or equal to the current expected price.',
            });
        }

        // Update expected price
        const updateResult = await SelfInspectedCarsModel.updateOne(
            { _id: carId },
            { $set: { expectedPrice: newExpectedPrice } }
        );

        if (updateResult.modifiedCount === 0) {
            return res.status(400).json({
                success: false,
                message: 'No changes made.',
            });
        }

        const currentFixedMargin = parseFloat(carData.fixedMargin || 0);
        const currentVariableMargin = parseFloat(carData.variableMargin || 0);

        // Broadcast update
        SocketService.broadcast(
            EVENTS.SELF_INSPECTED_CAR_EXPECTED_PRICE_UPDATED,
            {
                carId,
                newExpectedPrice,
                fixedMargin: currentFixedMargin,
                variableMargin: currentVariableMargin,
            }
        );

        // Send Notification to Seller And Dealers
        notifyDealerAndSellerOnExpectedPriceUpdate({
            carId,
            newExpectedPrice: expectedPrice,
        }).catch(err => {
            console.error('Notification failed (ignored):', err.message);
        });


        // Return success response
        return res.status(200).json({
            success: true,
            message: 'Expected price updated successfully.',
        });

    } catch (error) {
        console.error("setSelfInspectedCarExpectedPrice:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }
};



// Accept offer
exports.acceptSelfInspectedCarOffer = async (req, res) => {
    try {
        const { 
            carId, customerContactNumber, inspectionDateTime, 
            inspectionAddress, city, pinCode, remarks, contactPerson, userId } = req.body;

        if (!carId || !customerContactNumber || !inspectionDateTime || 
            !inspectionAddress || !city || !pinCode || !contactPerson || !userId) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Load car
        const car = await SelfInspectedCarsModel.findById(carId);
        if (!car) return res.status(404).json({ message: 'Car not found' });

        // Schedule Inspection
        try {
            await addTelecalling(
                {
                    body: {
                        carRegistrationNumber: car.registrationNumber,
                        ownerName: car.registeredOwner,
                        yearOfRegistration: car.registrationDate.getFullYear(),
                        ownershipSerialNumber: car.ownershipSerialNo,
                        make: car.make,
                        model: car.model,
                        variant: car.variant,

                        odometerReadingInKms: car.odometer,
                        additionalNotes: car.additionalNotes,
                        inspectionDateTime,
                        inspectionAddress,
                        customerContactNumber,
                        city,
                        zipCode: pinCode,
                        yearOfManufacture: car.manufacturingDate.getFullYear(),
                        priority: 'High',
                        remarks,
                        createdBy: userId,
                        inspectionStatus: 'Pending',
                        addedBy: CONSTANTS.USER_ROLES.DEALER_AS_SELLER,
                        inspectionRequestedThrough: 'Accept Self Inspected Car Offer',
                        contactPerson,
                    },
                    files: [],
                },
                {
                    status: () => ({ json: () => {} }),
                }
            );
        } catch (err) {
            console.error("acceptSelfInspectedCarOffer Error:", err);
            return res.status(400).json({
                success: false,
                message: "Failed to accept offer, Please contact support.",
            });
        }

        // Update car status to OFFER_ACCEPTED
        car.auctionStatus = CONSTANTS.SELF_INSPECTED_CARS_AUCTION_STATUS.OFFER_ACCEPTED;
        car.soldAt = car.highestOffer;
        car.soldTo = car.highestOfferBy;
        car.soldBy = userId;
        await car.save();

        // Notify clients that car is removed from pd
        SocketService.emitToRoom(EVENTS.PD_SECTION_ROOM, EVENTS.PD_SECTION_UPDATED, {
            action: 'removed',
            id: car._id.toString(),
        });

        // Notify seller that the offer has been accepted for his car
        const sellerId = await getUserIdByPhoneNumber(car.sellerContactNumber);
        if (sellerId) {
            
            const soldAtAmountAfterMarginAdjustment = getDecreasedMarginAmount({
                amount: car.highestOffer,
                fixedMargin: car.fixedMargin,  
                variableMargin: car.variableMargin,
            });

            await sendPushToExternalId({
                externalId: sellerId,
                title: `Offer Accepted`,
                body: `🎉 “Congratulations!  The offer of ₹${soldAtAmountAfterMarginAdjustment.toLocaleString('en-IN')}/- has been accepted for your car ${car.make} ${car.model}. Our team will contact you.`,
                data: {},
            });
        } else {
            console.warn(`[Push] No user found for car.sellerContactNumber=${car.sellerContactNumber}. Skipping seller push.`);
        }

        const agenda = getAgenda();
        await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.SCHEDULE_SELF_INSPECTED_CAR_AUCTION, 'data.carId': carId.toString() });

        return res.status(200).json({ success: true, data: { carId: car._id.toString(), buyerId: car.highestOfferBy, price: car.highestOffer } });

    } catch (error) {
        console.error('acceptSelfInspectedCarOffer Error:', error);
         return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }
};


// ================= Upload Self Inspected Car Image =================
exports.uploadSelfInspectedCarImage = async (req, res) => {
    try {
        const { registrationNumber } = req.body;

        // Validate registration number
        if (!registrationNumber) {
            return res.status(400).json({
                success: false,
                message: "registrationNumber is required"
            });
        }

        // Validate image
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "Image is required"
            });
        }

        // Create cloudinary folder path
        const cloudinaryParentFolder = process.env.CLOUDINARY_PARENT_FOLDER;

        const cloudinaryFolder = `${cloudinaryParentFolder}/Self Inspected Cars Images/${registrationNumber}`;

        // Upload image
        const uploadResult = await uploadSingleImage({
            file: req.file,
            folder: cloudinaryFolder,
            fileId: `${registrationNumber}_${Date.now()}`,
            compress: true
        });

        // Return response
        return res.status(200).json({
            success: true,
            message: "Image uploaded successfully",
            data: {
                registrationNumber,
                publicId: uploadResult.publicId,
                url: uploadResult.url
            }
        });

    } catch (error) {
        console.error("uploadSelfInspectedCarImage Error:", error);
        return res.status(500).json({
            success: false,
            message: error.message || "Internal Server Error"
        });
    }
};


// ======================= Delete Self Inspected Car Image =======================
exports.deleteSelfInspectedCarImage = async (req, res) => {
    const publicId = req.body.publicId;
    if (!publicId) {
        return res.status(400).json({
            success: false,
            message: "Public ID is required",
        });
    }
    try {
        const out = await deleteImageFromCloudinary(publicId);

        if (out.result === "not found") {
            return res.status(404).json({
                success: false,
                message: "Image not found on Cloudinary",
                ...out,
            });
        }
        return res.status(200).json({
            success: true,
            message: "Image deleted successfully",
        });
    } catch (error) {
        console.log("Error while deleting image from cloudinary", error);
        return res.status(400).json({
            success: false,
            message: "Delete failed",
        });
    }
};