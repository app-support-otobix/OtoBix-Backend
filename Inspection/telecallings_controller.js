const TelecallingsModel = require('../Models/telecallingsModel');
const NotificationsModel = require('../Models/userNotificationsModel');
const cloudinary = require('../Config/cloudinary');
const sharp = require('sharp');
const { sendPushToExternalId } = require('../Helper Functions/send_notification_helpers');
const { getCustomerIdByPhoneNumber, getInspectionEngineerIdByPhoneNumber } = require('../Helper Functions/external_id_extraction_helpers');



// ======================= Fetch Telecallings List By Telecaller ========================
exports.fetchTelecallingsListByTelecaller = async (req, res) => {
    try {
        const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
        const pageNumber = Math.max(parseInt(req.query.pageNumber, 10) || 1, 1);
        const appointmentId = req.query.appointmentId;

        const filter = appointmentId ? { appointmentId } : {};

        const telecallingsList = await TelecallingsModel.find(filter)
            .sort({ updatedAt: -1 })
            .skip((pageNumber - 1) * limit)
            .limit(limit);

        const total = await TelecallingsModel.countDocuments(filter);

        console.log("Telecalligs list fetched successfully");
        return res.status(200).json({
            success: true,
            count: telecallingsList.length,
            total,
            pageNumber,
            limit,
            data: telecallingsList,
        });
    } catch (error) {
        console.error("fetchTelecallingsListByTelecaller:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching telecallings",
            error: error.message,
        });
    }
};




// ======================= Fetch Telecallings List By Inspection Engineer =======================
exports.fetchTelecallingsListByInspectionEngineer = async (req, res) => {
    try {
        const { inspectionStatus,  inspectionEngineerNumber, allocatedTo } = req.body;

        const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
        const pageNumber = Math.max(parseInt(req.query.pageNumber, 10) || 1, 1);
        const appointmentId = req.query.appointmentId; // optional

        const filter = {};

        if (inspectionStatus && inspectionStatus.trim()) {
            filter.inspectionStatus = inspectionStatus.trim();
        }

        if (inspectionEngineerNumber && inspectionEngineerNumber.trim()) {
            filter.inspectionEngineerNumber = inspectionEngineerNumber.trim();
        }

        if (allocatedTo && allocatedTo.trim()) {
            filter.allocatedTo = allocatedTo.trim();
        }

        if (appointmentId) {
            filter.appointmentId = appointmentId;
        }

        const telecallingsList = await TelecallingsModel.find(filter)
            .sort({ updatedAt: -1 })
            .skip((pageNumber - 1) * limit)
            .limit(limit);

        const total = await TelecallingsModel.countDocuments(filter);

        return res.status(200).json({
            success: true,
            count: telecallingsList.length,
            total,
            pageNumber,
            limit,
            data: telecallingsList,
        });
    } catch (error) {
        console.error("fetchTelecallingsListByInspectionEngineer:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching telecallings",
            error: error.message,
        });
    }
};



// ======================= Fetch Telecallings List By Dealer (Seller) ========================
exports.fetchTelecallingsListByDealerAsSeller = async (req, res) => {
    try {
        const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
        const pageNumber = Math.max(parseInt(req.query.pageNumber, 10) || 1, 1);
        const userId = req.query.userId;

        const telecallingsList = await TelecallingsModel.find({ createdBy: userId })
            .sort({ updatedAt: -1 })
            .skip((pageNumber - 1) * limit)
            .limit(limit);

        const total = await TelecallingsModel.countDocuments({ createdBy: userId });

        console.log("Telecalligs list fetched successfully");
        return res.status(200).json({
            success: true,
            count: telecallingsList.length,
            total,
            pageNumber,
            limit,
            data: telecallingsList,
        });
    } catch (error) {
        console.error("fetchTelecallingsListByDealerAsSeller:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching telecallings",
            error: error.message,
        });
    }
};








// ======================= Add Telecalling =======================
exports.addTelecalling = async (req, res) => {
    try {
        const {
            carRegistrationNumber,
            ownerName,
            yearOfRegistration,
            ownershipSerialNumber,
            make,
            model,
            variant,
            
            // optional
            appointmentId,
            odometerReadingInKms,
            additionalNotes,
            inspectionDateTime,
            inspectionAddress,
            customerContactNumber,
            city,
            emailAddress,
            appointmentSource,
            vehicleStatus,
            zipCode,
            yearOfManufacture,
            allocatedTo,
            priority,
            ncdUcdName,
            repName,
            repContact,
            bankSource,
            referenceName,
            remarks,
            createdBy,
            inspectionStatus,
            approvalStatus,
            inspectionEngineerNumber,
            addedBy,
            inspectionRequestedThrough,
            contactPerson,
        } = req.body;

        // basic validation
        const missing = [];
        if (!carRegistrationNumber) missing.push("carRegistrationNumber");
        if (!ownerName) missing.push("ownerName");
        if (!yearOfRegistration) missing.push("yearOfRegistration");
        if (!ownershipSerialNumber) missing.push("ownershipSerialNumber");
        if (!make) missing.push("make");
        if (!model) missing.push("model");
        if (!variant) missing.push("variant");

        if (missing.length) {
            return res.status(400).json({
                success: false,
                message: `Missing required fields: ${missing.join(", ")}`,
            });
        }

        // // duplicate check (because appointmentId is unique)
        // const exists = await TelecallingsModel.findOne({
        //     appointmentId: appointmentId.trim(),
        // }).lean();

        // if (exists) {
        //     return res.status(400).json({
        //         success: false,
        //         message: `Inspection request for appointmentId ${appointmentId} already exists.`,
        //     });
        // }

        // Upload images if present
        let carImageUrls = [];
        if (req.files && req.files.length > 0) {
            const folder =
                process.env.CLOUDINARY_PARENT_FOLDER +
                "/Telecallings Cars Images/" +
                carRegistrationNumber.trim();

            const uploadPromises = req.files.map(async (file, index) => {
                const compressedBuffer = await compressImage(file.buffer);

                const originalName = file.originalname || `image_${index}`;
                const timePart = Date.now();
                const fileId = `${timePart}_${index}_${originalName.replace(/\s+/g, "_")}`;

                const url = await uploadImageWithCheck(compressedBuffer, folder, fileId);
                return url;
            });

            carImageUrls = await Promise.all(uploadPromises);
        }

        // payload for TelecallingsModel
        const payload = {
            carRegistrationNumber: carRegistrationNumber.trim(),
            ownerName: ownerName.trim(),
            yearOfRegistration: String(yearOfRegistration).trim(),
            ownershipSerialNumber: Number(ownershipSerialNumber),
            make: make.trim(),
            model: model.trim(),
            variant: variant.trim(),
            carImages: carImageUrls,

            // optional fields (set only if provided; defaults in schema cover rest)
            customerContactNumber: customerContactNumber?.trim(),
            city: city?.trim(),
            emailAddress: emailAddress?.trim(),
            appointmentSource: appointmentSource?.trim(),
            vehicleStatus: vehicleStatus?.trim(),
            zipCode: zipCode?.trim(),
            allocatedTo: allocatedTo?.trim(),
            priority: priority?.trim(),
            ncdUcdName: ncdUcdName?.trim(),
            repName: repName?.trim(),
            repContact: repContact?.trim(),
            bankSource: bankSource?.trim(),
            referenceName: referenceName?.trim(),
            remarks: remarks?.trim(),
            createdBy: createdBy?.trim(),
            inspectionEngineerNumber: inspectionEngineerNumber?.trim(),
            addedBy: addedBy?.trim(),
            contactPerson: contactPerson?.trim(),
        };

        if (appointmentId && String(appointmentId).trim()) {
            payload.appointmentId = String(appointmentId).trim(); // ✅ use provided
        }

        if (yearOfManufacture !== undefined && yearOfManufacture !== null && yearOfManufacture !== "") {
            payload.yearOfManufacture = Number(yearOfManufacture);
        }

        if (odometerReadingInKms !== undefined && odometerReadingInKms !== null && odometerReadingInKms !== "") {
            payload.odometerReadingInKms = Number(odometerReadingInKms);
        }

        if (additionalNotes) payload.additionalNotes = additionalNotes.trim();

        if (inspectionDateTime) {
            const dt = new Date(inspectionDateTime);
            if (!isNaN(dt.getTime())) payload.inspectionDateTime = dt;
        }

        if (inspectionAddress) payload.inspectionAddress = inspectionAddress.trim();

        if (inspectionStatus) payload.inspectionStatus = inspectionStatus.trim(); // default is Pending

        if (approvalStatus) payload.approvalStatus = approvalStatus.trim(); // default is Pending

        if (inspectionRequestedThrough) payload.inspectionRequestedThrough = inspectionRequestedThrough.trim(); // default is Sell My Car

        // appointmentId is auto-set by plugin ✅

        const doc = await TelecallingsModel.create(payload);

        // Send Notification to customer if inspection scheduled
        const isScheduled = !!(doc.inspectionDateTime && doc.inspectionAddress);
        if (isScheduled) {
            const dtObj = new Date(doc.inspectionDateTime);

            if (!isNaN(dtObj.getTime())) {
                const readableDateTime = dtObj.toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                });

                const customerNumber = (doc.customerContactNumber || "").trim();
                if (customerNumber) {
                    const customerId = await getCustomerIdByPhoneNumber(customerNumber);
                    if (customerId) {
                        await sendPushToExternalId({
                            externalId: customerId,
                            title: `Inspection Scheduled!`,
                            body: `Your inspection for ${doc.make} ${doc.model} is scheduled on ${readableDateTime}.`,
                            data: {},
                        });
                    } else {
                        console.warn(
                            `[Push] No user found for customerContactNumber=${customerNumber}. Skipping customer push.`
                        );
                    }
                }
            } else {
                console.warn(
                    `[Push] Invalid inspectionDateTime=${doc.inspectionDateTime}. Skipping customer push.`
                );
            }
        }



        console.log('Telecalling added successfully');

        return res.status(200).json({
            success: true,
            message: "Telecalling created successfully",
            data: doc,
        });
    } catch (err) {
        console.error("Error creating telecalling:", err);

        // Handle duplicate key errors from MongoDB
        if (err?.code === 11000) {
            const key = Object.keys(err.keyPattern || {})[0] || "field";
            return res.status(409).json({
                success: false,
                message: `Duplicate value for ${key}.`,
                error: err.message,
            });
        }

        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: err.message,
        });
    }
};



// ======================= Update Telecalling (by telecallingId OR appointmentId) =======================
exports.updateTelecalling = async (req, res) => {
    try {
        const { telecallingId, appointmentId, changedBy, source, ...updates } = req.body;

        // ✅ At least one identifier required
        if (!telecallingId && !appointmentId) {
            return res.status(400).json({
                success: false,
                message: "telecallingId or appointmentId is required.",
            });
        }

        // ✅ Protect fields (never allow client to set these)
        delete updates.logs;
        delete updates.__v;
        delete updates.createdAt;
        delete updates.updatedAt;
        delete updates.timeStamp;

        // ✅ Never allow appointmentId update via $set (only used for lookup/create)
        delete updates.appointmentId;

        // ✅ Build filter
        const cleanAppointmentId = appointmentId ? String(appointmentId).trim() : null;
        const filter = telecallingId ? { _id: telecallingId } : { appointmentId: cleanAppointmentId };

        // 1) Find existing (for status comparison + existence)
        const before = await TelecallingsModel.findOne(filter).lean();
        const isCreatingNew = !before && !!cleanAppointmentId && !telecallingId;

        let doc;

        if (before) {
            // ✅ Update existing doc (only provided fields)
            doc = await TelecallingsModel.findOneAndUpdate(
                filter,
                { $set: updates },
                {
                    new: true,
                    runValidators: true,
                    audit: {
                        changedBy: changedBy || "unknown_user",
                        source: source || "unknown_source",
                    },
                }
            );

            if (!doc) {
                return res.status(404).json({
                    success: false,
                    message: "Telecalling not found.",
                });
            }
        } else {
            // ✅ Create new doc (ONLY possible if appointmentId is given)
            if (!cleanAppointmentId) {
                return res.status(400).json({
                    success: false,
                    message: "appointmentId is required to create a new doc.",
                });
            }

            // ✅ Validate required fields for creation (schema requires these)
            const missing = [];
            if (!updates.carRegistrationNumber) missing.push("carRegistrationNumber");
            if (!updates.ownerName) missing.push("ownerName");
            if (!updates.yearOfRegistration) missing.push("yearOfRegistration");
            if (updates.ownershipSerialNumber === undefined || updates.ownershipSerialNumber === null)
                missing.push("ownershipSerialNumber");
            if (!updates.make) missing.push("make");
            if (!updates.model) missing.push("model");
            if (!updates.variant) missing.push("variant");

            if (missing.length) {
                return res.status(400).json({
                    success: false,
                    message: `No doc found for appointmentId. To create new, missing required fields: ${missing.join(", ")}`,
                });
            }

            // ✅ Create with appointmentId (plugin will keep it if unique)
            const payload = {
                ...updates,
                appointmentId: cleanAppointmentId,
            };

            doc = await TelecallingsModel.create(payload);
        }

        // ===================== Notification logic (same behavior) =====================
        const beforeStatus = ((before?.inspectionStatus) || "").trim().toLowerCase();
        const afterStatus = ((doc.inspectionStatus) || "").trim().toLowerCase();
        const becameScheduled = beforeStatus !== "scheduled" && afterStatus === "scheduled";

        if (
            becameScheduled &&
            doc.inspectionDateTime &&
            doc.inspectionAddress &&
            doc.inspectionEngineerNumber
        ) {
            const dtObj = new Date(doc.inspectionDateTime);

            if (!isNaN(dtObj.getTime())) {
                const readableDateTime = dtObj.toLocaleString("en-IN", {
                    timeZone: "Asia/Kolkata",
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                });

                // To customer
                const customerNumber = (doc.customerContactNumber || "").trim();
                if (customerNumber) {
                    const customerId = await getCustomerIdByPhoneNumber(customerNumber);
                    if (customerId) {
                        await sendPushToExternalId({
                            externalId: customerId,
                            title: `Inspection Assigned!`,
                            body: `Inspection for your ${doc.make} ${doc.model} is assigned to our engineer. You will be contacted soon.`,
                            data: {},
                        });
                    }
                }

                // To inspection engineer
                const engineerNumber = (doc.inspectionEngineerNumber || "").trim();
                if (engineerNumber) {
                    const inspectionEngineerId = await getInspectionEngineerIdByPhoneNumber(engineerNumber);
                    if (inspectionEngineerId) {
                         // 1) Send Push Notification
                        await sendPushToExternalId({
                            externalId: inspectionEngineerId,
                            title: `Inspection Assigned!`,
                            body: `New inspection assigned to you for ${doc.make} ${doc.model} on ${readableDateTime}.`,
                            data: {},
                        });

                         // 2) Store In App Notification In Database
                        await NotificationsModel.create({
                            userId: inspectionEngineerId,
                            type: 'inspection_assigned',
                            title: 'Inspection Assigned!',
                            body: `New inspection assigned to you for ${doc.make} ${doc.model} on ${readableDateTime}.`,
                            isRead: false,
                            createdAt: new Date(),
                            data: {
                                appointmentId: doc.appointmentId || '',
                                ownerName: doc.ownerName || '',
                                customerContactNumber: doc.customerContactNumber || '',
                                inspectionDateTime: doc.inspectionDateTime || new Date(),
                                inspectionAddress: doc.inspectionAddress || '',
                                priority: doc.priority || '',
                            },
                            isGlobal: false,
                        });
                    }
                }
            }
        }

        // ===================== Response =====================
        return res.status(200).json({
            success: true,
            message: isCreatingNew
                ? "Telecalling created successfully (via appointmentId)."
                : "Telecalling updated successfully.",
            data: doc,
        });
    } catch (error) {
        console.error("Error updating telecalling:", error);

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
            message: "Error updating telecalling",
            error: error.message,
        });
    }
};




// ======================= Delete Telecalling =======================
exports.deleteTelecalling = async (req, res) => {
    try {
        const { telecallingId } = req.body;

        if (!telecallingId) {
            return res.status(400).json({
                success: false,
                message: "Telecalling ID is required.",
            });
        }

        const deleted = await TelecallingsModel.findByIdAndDelete(telecallingId);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Telecalling not found.",
            });
        }

        console.log('Telecalling deleted successfully');
        return res.status(200).json({
            success: true,
            message: "Telecalling deleted successfully.",
        });
    } catch (error) {
        console.error("Error deleting telecalling:", error);
        return res.status(500).json({
            success: false,
            message: "Error deleting telecalling",
            error: error.message,
        });
    }
};



// ======================= Fetch Telecalling Details =======================
exports.fetchTelecallingDetails = async (req, res) => {
    try {
        const { telecallingId } = req.query;

        if (!telecallingId) {
            return res.status(400).json({
                success: false,
                message: "Telecalling ID is required.",
            });
        }

        const telecalling = await TelecallingsModel.findById(telecallingId);

        if (!telecalling) {
            return res.status(404).json({
                success: false,
                message: "Telecalling not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Telecalling fetched successfully.",
            data: telecalling,
        });

    } catch (error) {
        console.error("fetchTelecallingDetails:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};





// ======================= Helper: Compress image to ~100KB =======================
async function compressImage(buffer) {
    const targetSize = 100 * 1024; // 100 KB
    let quality = 80;
    let width = 1000;
    let compressedBuffer = buffer;

    while (width >= 200) {
        let currentQuality = quality;

        while (currentQuality >= 30) {
            compressedBuffer = await sharp(buffer)
                .resize({ width, withoutEnlargement: true })
                .jpeg({ quality: currentQuality })
                .toBuffer();

            if (compressedBuffer.byteLength <= targetSize) {
                // console.log(`✅ ${(compressedBuffer.byteLength / 1024).toFixed(1)} KB at ${width}px & q=${currentQuality}`);
                return compressedBuffer;
            }

            currentQuality -= 10;
        }

        width -= 100;
    }

    console.warn(
        `⚠️ Could not compress below 100 KB. Final size: ${(compressedBuffer?.byteLength / 1024).toFixed(1)} KB`
    );
    return compressedBuffer;
}


// ======================= Helper: Upload image with check =======================
async function uploadImageWithCheck(buffer, folder, fileId) {
    const publicId = `${folder}/${fileId}`;


    const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                public_id: fileId,
                resource_type: 'image',
            },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
    });

    return uploadResult.secure_url;
}
