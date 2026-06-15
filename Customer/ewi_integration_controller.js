// Controllers/ewi_integration_controller.js
const axios = require("axios");
require("dotenv").config();
const EwiIntegrationModel = require('../Models/ewiIntegrationModel');
const WarrantyModel = require('../Models/warrantyModel');
const CarModel = require('../Models/carModel');
const { sendPushToExternalId } = require('../Helper Functions/send_notification_helpers');
const { getCustomerIdByPhoneNumber } = require('../Helper Functions/external_id_extraction_helpers');

// EWI Integration credentials from .env
const ewiRequestUrl = process.env.EWI_REQUEST_URL;
const ewiAuthorizationToken = process.env.EWI_AUTHORIZATION_TOKEN;
const ewiXApiKey = process.env.EWI_X_API_KEY;
const ewiCookie = process.env.EWI_COOKIE;
const ewiSaleApiForGetWarrantyUrl = process.env.EWI_SALE_API_FOR_GET_WARRANTY_URL;
const ewiSaleApiForRSAUrl = process.env.EWI_SALE_API_FOR_RSA_URL;

const thirdPartyAccessToken = process.env.THIRD_PARTY_ACCESS_TOKEN;



// // ======================= EWI Certification API Test =======================
// // Cut and Paste this api in api where you move car to dealer app
// const { runEwiInBackground } = require('../Helper Functions/request_ewi_certification_api_helper');
// const CarModel = require('../Models/carModel');
// exports.requestEwi = async (req, res) => {
    
//     try {


// //         // const main = req.body;
// //      const main = await CarModel.findOne({ registrationNumber: req.body.registrationNumber });

// //     //////////////////////////////////////////////////////////////////////////////////////
// //   // helpers
// // const toString = (v, d = 'N/A') => {
// //   if (v === null || v === undefined) return d;
// //   const s = String(v).trim();
// //   return s.length === 0 ? d : s;
// // };
// // const numberToString = (v, d = 'N/A') => (Number.isFinite(Number(v)) ? String(Number(v)) : d);
// // const dateYYYMMDD = (v, d = 'N/A') => {
// //   const dt = v ? new Date(v) : null;
// //   return dt && !isNaN(dt.getTime()) ? dt.toISOString().slice(0, 10) : d;
// // };
// // const listToCommaString = (list, d = 'N/A') => {
// //   if (!Array.isArray(list)) return d;

// //   const cleaned = list
// //     .filter((v) => v !== null && v !== undefined)
// //     .map((v) => String(v).trim())
// //     .filter((v) => v.length > 0);

// //   return cleaned.length ? cleaned.join(', ') : d;
// // };
// // const compressorOrWorking = (v) => {
// //   const s = v === null || v === undefined ? "N/A" : String(v);
// //   return s.toLowerCase().includes("compressor") ? s : "Working";
// // };
// // const hornNotWorking = (v) => {
// //   const s = v === null || v === undefined ? "N/A" : String(v);
// //   return s.toLowerCase().includes("horn not working") ? s : "Okay";
// // };
// // const absWarningLightGlowingList = (list, d = 'Okay') => {
// //   if (!Array.isArray(list) || list.length === 0) return d;

// //   const hasGlowing = list
// //     .filter((v) => v !== null && v !== undefined)
// //     .some((v) => String(v).trim().toLowerCase() === 'abs warning light glowing');

// //   return hasGlowing ? 'Glowing' : 'Okay';
// // };
// // const acceleratorOrWorking = (list) => {
// //   if (!Array.isArray(list)) return "Working";

// //   const match = list
// //     .filter((v) => v !== null && v !== undefined)
// //     .map((v) => String(v).trim())
// //     .find((v) => v.length > 0 && v.toLowerCase().includes("accelerator"));

// //   return match ? match : "Working";
// // };
// // const centralLockOrWorking = (list) => {
// //   if (!Array.isArray(list)) return "Working";

// //   const match = list
// //     .filter((v) => v !== null && v !== undefined)
// //     .map((v) => String(v).trim())
// //     .find((v) => v.length > 0 && v.toLowerCase().includes("central lock not working"));

// //   return match ? match : "Working";
// // };

// // // ✅ GOOD / Direct matches (filled from your car doc)
// // const ewiPayload = {
// //   // Required identifiers
// //   appointmentId: toString(main.appointmentId),
// //   ChassisNo: toString(main.chassisNumber),
// //   RegNo: toString(main.registrationNumber).toUpperCase(),

// //   // Customer info
// //   username: toString(main.registeredOwner),
// //   Areaoffice: toString(main.city),
// //   CustomerName: toString(main.registeredOwner),
// //   address: toString(main.registeredAddressAsPerRc),
// //   mobile: toString(main.contactNumber),

// //   // Vehicle basic
// //   Make: toString(main.make),
// //   Model: toString(main.model),
// //   Varient: toString(main.variant),
// //   CityRegistration: toString(main.registeredRto),
// //   Colour: toString(main.color),

// //   // thirdparty expects Odometer string
// //   Odometer: numberToString(main.odometerReadingInKms, ''),

// //   VehicleRegiteredAs: toString(main.registrationType),
// //   FuelType: toString(main.fuelType),

// //   ManufacturingYears: (() => {
// //     const dt = main.yearMonthOfManufacture ? new Date(main.yearMonthOfManufacture) : null;
// //     return dt && !isNaN(dt.getTime()) ? String(dt.getFullYear()) : '';
// //   })(),

// //   VehicleReg: dateYYYMMDD(main.registrationDate, ''),

// //   EngineNo: toString(main.engineNumber),
// //   NoOfOwner: numberToString(main.ownerSerialNumber, ''),

// //   // Hypothecation rule: if not empty => Yes else No
// //   CarUnderHypothecation: main.hypothecationDetails ? 'Yes' : 'No',
// //   NOC: toString(main.rtoNoc),

// //   // Body panels
// //   Bonnet_Hood: listToCommaString(main.bonnetDropdownList),
// //   FrontBumper: listToCommaString(main.frontBumperDropdownList),
// //   RearBumper: listToCommaString(main.rearBumperDropdownList),
// //   DickyBoot: listToCommaString(main.bootDoorDropdownList),

// //   FrontRHFender: listToCommaString(main.rhsFenderDropdownList),
// //   FrontLHFender: listToCommaString(main.lhsFenderDropdownList),

// //   RearRHQuarterPannel: listToCommaString(main.rhsQuarterPanelDropdownList),
// //   RearLHQuarterPannel: listToCommaString(main.lhsQuarterPanelDropdownList),

// //   DoorFRRH: listToCommaString(main.rhsFrontDoorDropdownList),
// //   DoorFRLH: listToCommaString(main.lhsFrontDoorDropdownList),
// //   DoorRRRH: listToCommaString(main.rhsRearDoorDropdownList),
// //   DoorRRLH: listToCommaString(main.lhsRearDoorDropdownList),

// //   A_PillarFRRH: listToCommaString(main.rhsAPillarDropdownList),
// //   A_PillarFRLH: listToCommaString(main.lhsAPillarDropdownList),

// //   B_PillarFRRH: listToCommaString(main.rhsBPillarDropdownList),
// //   B_PillarFRLH: listToCommaString(main.lhsBPillarDropdownList),

// //   C_PillarFRRH: listToCommaString(main.rhsCPillarDropdownList),
// //   C_PillarFRLH: listToCommaString(main.lhsCPillarDropdownList),

// //   RunningBoardFRRH: listToCommaString(main.rhsRunningBorderDropdownList),
// //   RunningBoardFRLH: listToCommaString(main.lhsRunningBorderDropdownList),

// //   // Engine bay + mechanical
// //   EngineCompartmentCondition: listToCommaString(main.engineDropdownList),
// //   EngineSound: listToCommaString(main.enginePermisableBlowByDropdownList),
// //   EngineOilLevel: listToCommaString(main.engineOilLevelDipstickDropdownList),
// //   EngineOilQuality: listToCommaString(main.engineOilDropdownList),
// //   ExhaustEmission: listToCommaString(main.exhaustSmokeDropdownList),

// //   BrakeFluid: listToCommaString(main.brakesDropdownList),
// //   CoolantQuality_Quantity: listToCommaString(main.coolantDropdownList),

// //   GearBoxCondition: listToCommaString(main.gearShiftDropdownList),
// //   Clutch: listToCommaString(main.clutchDropdownList),

// //   // Interior / electricals
// //   Interior: listToCommaString(main.commentOnInteriorDropdownList),
// //   Seat: toString(main.seatsUpholstery),

// //   PowerWindow: main.noOfPowerWindows ? 'Yes' : 'No',
// //   PowerWindowOperation:
// //     `RHSFront: ${listToCommaString(main.rhsFrontDoorFeaturesDropdownList)} / LHSFront: ${listToCommaString(main.lhsFrontDoorFeaturesDropdownList)} / RHSRear: ${listToCommaString(main.rhsRearDoorFeaturesDropdownList)} / LHSRear: ${listToCommaString(main.lhsRearDoorFeaturesDropdownList)}`,

// //   PowerSteering: main.steering ? 'Yes' : 'No',
// //   PowerSteeringOperation: listToCommaString(main.steeringDropdownList),

// //   NoAirBags: numberToString(main.noOfAirBags, ''),
// //   ABS: toString(main.abs),

// //   RearParkingSystem: listToCommaString(main.reverseCameraDropdownList),
// //   SunRoof: listToCommaString(main.sunroofDropdownList),

// //   DisplayScreen: listToCommaString(main.steeringDropdownList),
// //   MusicSystem: listToCommaString(main.infotainmentSystemDropdownList),

// //   AirCondition: listToCommaString(main.acCoolingDropdownList),

// //   Battery: listToCommaString(main.batteryDropdownList),
// //   Windshield: listToCommaString(main.frontWindshieldDropdownList),
// //   Suspension: listToCommaString(main.suspensionDropdownList),

// //   // Tyres & alloys
// //   TyreFR: listToCommaString(main.rhsFrontTyreDropdownList),
// //   TyreFL: listToCommaString(main.lhsFrontTyreDropdownList),
// //   TyreRR: listToCommaString(main.rhsRearTyreDropdownList),
// //   TyreRF: listToCommaString(main.lhsRearTyreDropdownList),

// //   SpareTyre: listToCommaString(main.spareTyreDropdownList),

// //   Wheel_RimFR: listToCommaString(main.rhsFrontWheelDropdownList),
// //   Wheel_RimFL: listToCommaString(main.lhsFrontWheelDropdownList),
// //   Wheel_RimRR: listToCommaString(main.rhsRearWheelDropdownList),
// //   Wheel_RimRl: listToCommaString(main.lhsRearWheelDropdownList),

// //   VehicleCC: numberToString(main.cubicCapacity, ''),

// //   TechnicianComments: listToCommaString(main.commentsOnExteriorDropdownList),

// //   WarrantyPeriod: '12 Months',
// //   ProgrameType: 'Extended Warranty',

// //   // Internal rule check
// //   registrationDate: main.registrationDate,
// //   odometerReading: Number.isFinite(Number(main.odometerReadingInKms)) ? Number(main.odometerReadingInKms) : undefined,
// // };

// // // ⚠️ NOT-GOOD / Not present in your car doc (set to empty string)
// // Object.assign(ewiPayload, {
// //   DriveType: listToCommaString(main.driveTrainDropdownList),
// //   GearBox: listToCommaString(main.commentsOnTransmissionDropdownList),
// //   CNGLPG_Fitting: toString(main.fuelType),
// //   CNGLPG_Endorsed: listToCommaString(main.additionalDetailsDropdownList),
// //   Compresor: compressorOrWorking(main.commentsOnAC),
// //   RadiatorFan: listToCommaString(main.commentsOnRadiatorDropdownList),
// //   Radiator: listToCommaString(main.commentsOnRadiatorDropdownList),
// //   GearBoxOperation: `GearShift: ${listToCommaString(main.gearShiftDropdownList)} / CommentsOnTransmission: ${listToCommaString(main.commentsOnTransmissionDropdownList)}`,
// //   Pick_Up: listToCommaString(main.clutchDropdownList),
// //   OperationBrake: listToCommaString(main.brakesDropdownList),
// //   Immobiliser: listToCommaString(main.commentsOnClusterMeterDropdownList),
// //   Heater: toString(main.commentsOnAC),
// //   AutomaticTransmissionLight: listToCommaString(main.commentsOnClusterMeterDropdownList),
// //   Alternator: listToCommaString(main.commentsOnEngineDropdownList),
// //   StartingCar: listToCommaString(main.commentsOnTowingDropdownList),
// //   MalfuctionLight: listToCommaString(main.commentsOnClusterMeterDropdownList),
// //   TurboOption: listToCommaString(main.commentsOnEngineDropdownList),
// //   TurboOptionGearBoxType: listToCommaString(main.transmissionTypeDropdownList),
// //   BrakePadLife: listToCommaString(main.brakesDropdownList),
// //   EmissionType: toString(main.norms),
// //   CarUnderWarranty: 'No', // Always No
// //   PowerSeat: listToCommaString(main.driverSeatDropdownList),
// //   Horn: hornNotWorking(main.steeringMountedSystemControls),
// //   ABSLight: absWarningLightGlowingList(main.commentsOnClusterMeterDropdownList),
// //   LightHeadTail: `RHS Headlamp: ${listToCommaString(main.rhsHeadlampDropdownList)} / LHS Headlamp: ${listToCommaString(main.lhsHeadlampDropdownList)}`,
// //   SpareWheels: listToCommaString(main.spareTyreDropdownList),
// //   ABCPadelOperation:  `A: ${acceleratorOrWorking(main.commentsOnOthersDropdownList)} / B: ${listToCommaString(main.brakesDropdownList)} / C: ${listToCommaString(main.clutchDropdownList)}`,
// //   CentralLocking: centralLockOrWorking(main.rhsFrontDoorFeaturesDropdownList),
// // //   BrakeFluidQuality: 'N/A',
// // //   OwnerType: 'N/A',
// // //   Type: 'N/A',
// // //   Operation: 'N/A',
// // });

// // // Slight “closest” combine (optional): Apron from lhs/rhs
// // ewiPayload.Apron = `LHS Apron: ${listToCommaString(main.lhsApron)} / RHS Apron: ${listToCommaString(main.rhsApron)}`;

// //     // Fire-and-forget (main api does not wait)
// //     runEwiInBackground(ewiPayload);

// //     //////////////////////////////////////////////////////////////////////////////////////


//     // Your main API response returns immediately
//     return res.status(200).json({
//       success: true,
//       message: 'Main API completed. EWI will run in background if eligible (logged even if skipped).',
//     });
//   } catch (err) {
//     return res.status(500).json({
//       success: false,
//       message: 'Main API error',
//       error: err?.message || String(err),
//     });
//   }
// };


// ======================= EWI Decision Callback (NO middleware) =======================
exports.ewiCallback = async (req, res) => {
    try {
        // 1) API Key check (vendor must send this header)
        // Header name you give them:  X-EWI-CALLBACK-KEY: <secret>

        if (!thirdPartyAccessToken) {
            return res.status(500).json({
                success: false,
                message: "THIRD_PARTY_ACCESS_TOKEN is not configured in .env",
            });
        }

        const receivedKey =
            req.headers["x-ewi-callback-key"] ||
            req.headers["x-api-key"] ||
            (req.headers["authorization"]
                ? req.headers["authorization"].replace(/^Bearer\s+/i, "")
                : "");

        if (!receivedKey || String(receivedKey).trim() !== String(thirdPartyAccessToken).trim()) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized callback (invalid key)",
            });
        }

        // 2) Read vendor payload
        const body = req.body || {};

        const vendorAppointmentId =
            body.AppointmentID || body["appointment-id"] || body.appointmentId;

        if (!vendorAppointmentId || !String(vendorAppointmentId).trim()) {
            return res.status(400).json({
                success: false,
                message: "AppointmentID is required in callback payload",
            });
        }

        // 3) OPTIONAL: prevent duplicate inserts if vendor retries callback
        // Using same appointmentId + apiType as unique logical key (no DB unique index required)
        const apiType = "Ewi Callback";
        // const already = await EwiIntegrationModel.findOne({
        //     appointmentId: String(vendorAppointmentId).trim(),
        //     apiType,
        // }).lean();

        // if (already) {
        //     console.log("⚠️ Duplicate EWI callback received, already stored:", already._id);
        //     return res.status(200).json({
        //         success: true,
        //         message: "Callback already stored",
        //         data: already,
        //     });
        // }

        // 4) Create a NEW document (you said: new doc with different apiType)
        const doc = await EwiIntegrationModel.create({
            appointmentId: String(vendorAppointmentId).trim(), // store their AppointmentID here
            inspectionId: body.InspectionId ? String(body.InspectionId).trim() : "",
            registrationNumber: body.RegNo ? String(body.RegNo).trim() : "",
            message: body.message ? String(body.message).trim() : "Callback received",
            warrantyCover: body.WarrantyCover ? String(body.WarrantyCover).trim() : "",
            warrantyPeriod: body.WarrantyPeriod ? String(body.WarrantyPeriod).trim() : "",
            programeType: body.ProgrameType ? String(body.ProgrameType).trim() : "", // may be missing in callback
            status: body.status ? String(body.status).trim() : "",
            engineerName: body.Engineer ? String(body.Engineer).trim() : "",
            apiType: apiType,
        });

        // 5) Console log
        // console.log("✅ EWI DECISION CALLBACK STORED:", {
        //     _id: doc._id,
        //     appointmentId: doc.appointmentId,
        //     inspectionId: doc.inspectionId,
        //     regNo: doc.registrationNumber,
        //     status: doc.status,
        //     engineer: doc.engineerName,
        // });

        // 6) Send notification to the customer
        if(doc.status === 'Approved'){
             const car = await CarModel.findOne(
             { registrationNumber: doc.registrationNumber }, 
            { contactNumber: 1 }  
                ).lean();

        try{
        
        const customerId = await getCustomerIdByPhoneNumber(car.contactNumber);
      if (customerId) {
        await sendPushToExternalId({
          externalId: customerId,
          title: `Extended Warranty Approved ✅`,
          body: `Your car is now eligible — complete the purchase to activate coverage.`,
          data: {},
        });
      } 
        }catch(error){
        console.warn(`[Push] No user found for car.contactNumber=${car.contactNumber}. Skipping customer push.`);
            console.log(error)
        }
    }


        // 7) Respond OK to vendor (important so they don't keep retrying)
        return res.status(200).json({
            success: true,
            message: "Callback stored successfully",
            data: doc,
        });
    } catch (err) {
        console.error("❌ Error storing EWI callback:", err?.message || err);
        return res.status(500).json({
            success: false,
            message: "Error storing callback",
            error: err?.message || String(err),
        });
    }
};




// ======================= EWI Sale API For Get Warranty =======================
exports.ewiSaleApiForGetWarranty = async (req, res) => {
    let warrantyDoc = null;

    try {
        if (!ewiSaleApiForGetWarrantyUrl || !ewiAuthorizationToken || !ewiXApiKey) {
            return res.status(500).json({
                success: false,
                message: "EWI Sale API (Get Warranty) credentials are missing in environment variables",
            });
        }

        // 1) Prepare data for your Warranty schema (only schema fields)
        const payloadToSave = {
            carImageUrl: req.body.carImageUrl || "",
            appointmentId: (req.body.appointmentId || "").trim(),
            
            warrantyPrice: Number(req.body.warrantyPrice || 0),
            warrantyPriceAfterMarkup: Number(req.body.warrantyPriceAfterMarkup || 0),
            warrantyPriceAfterGst: Number(req.body.warrantyPriceAfterGst || 0),

            markupPercentage: Number(req.body.markupPercentage || 0),
            gstPercentage: Number(req.body.gstPercentage || 0),
            
            paymentId: req.body.paymentId || "",
            apiHitThrough: req.body.apiHitThrough || "",
            userId: req.body.userId || "",
            carId: req.body.carId || "",

            // Api Req Body Fields (schema)
            userName: req.body.userName || "Otobix",
            name: req.body.name || "",
            address: req.body.address || "",
            mobile: req.body.mobile || "",
            email: req.body.email || "",
            vehicleRegDate: req.body.vehicleRegDate || "",

            dealerName: req.body.dealerName || "Otobix",
            areaOffice: req.body.areaOffice || "",
            chassisNo: req.body.chassisNo || "",
            engineNo: req.body.engineNo || "",
            make: req.body.make || "",
            model: req.body.model || "",
            warrantyCover: req.body.warrantyCover || "",
            warrantyPeriod: req.body.warrantyPeriod || "",
            vehicleCc: req.body.vehicleCc || "",
            regNo: req.body.regNo || "",
            odometer: req.body.odometer || "",

            // RSA fields (optional)
            policyHolderName: req.body.policyHolderName || "",
            fullBillingAddress: req.body.fullBillingAddress || "",

            // NEW: dummy response at logging time
            thirdPartyResponse: {
                status: "Pending",
                message: "Sale API (Get Warranty) call not executed yet",
                createdAt: new Date().toISOString(),
            },
        };

        // 2) Minimal validation (adjust as per your business rules)
        if (!payloadToSave.appointmentId) {
            return res.status(400).json({ success: false, message: "appointmentId is required" });
        }
        if (!payloadToSave.regNo) {
            return res.status(400).json({ success: false, message: "regNo is required" });
        }
        if (!payloadToSave.chassisNo) {
            return res.status(400).json({ success: false, message: "chassisNo is required" });
        }

        // 3) Create Warranty doc first (LOGGING)
        warrantyDoc = await WarrantyModel.create(payloadToSave);

        // 4) Build third-party payload EXACTLY as they require
        const thirdPartyPayload = {
            username: payloadToSave.userName,
            name: payloadToSave.name,
            address: payloadToSave.address,
            mobile: payloadToSave.mobile,
            email: payloadToSave.email,

            VehicleReg: payloadToSave.vehicleRegDate,
            DealerName: payloadToSave.dealerName,
            Areaoffice: payloadToSave.areaOffice,
            ChassisNo: payloadToSave.chassisNo,
            EngineNo: payloadToSave.engineNo,
            Make: payloadToSave.make,
            Model: payloadToSave.model,
            WarrantyCover: payloadToSave.warrantyCover,
            WarrantyPeriod: payloadToSave.warrantyPeriod,
            VehicleCC: payloadToSave.vehicleCc,
            RegNo: payloadToSave.regNo,
            Odometer: payloadToSave.odometer,
        };

        // 5) Hit third-party Sale API
        const ewiRes = await axios.post(ewiSaleApiForGetWarrantyUrl, thirdPartyPayload, {
            headers: {
                Authorization: ewiAuthorizationToken,
                "X-API-Key": ewiXApiKey,
                ...(ewiCookie ? { Cookie: ewiCookie } : {}),
                "Content-Type": "application/json",
            },
            timeout: 30000,
            validateStatus: () => true,
        });

        const httpStatus = ewiRes.status;
        const data = ewiRes.data || {};

        // 6) Update Warranty doc with ACTUAL third-party response
        // Store full response + useful metadata (no schema change needed because thirdPartyResponse is Object)
        const updatedWarranty = await WarrantyModel.findByIdAndUpdate(
            warrantyDoc._id,
            {
                $set: {
                    thirdPartyResponse: {
                        httpStatus,
                        response: data,
                        receivedAt: new Date().toISOString(),
                    },
                },
            },
            { new: true }
        );

         // 7) Already exists
         if(httpStatus === 409){
            return res.status(409).json({
            success: true,
            message:  "Warranty already created"   ,
            ewiHttpStatus: httpStatus,
            ewiResponse: data,
            savedWarranty: updatedWarranty,
        });}

// 8) Treat 200/201 as success
const isSuccess = httpStatus === 200 || httpStatus === 201;

// 9) If third party failed
if (!isSuccess) {
            return res.status(502).json({
                success: false,
                message: "EWI Sale API (Get Warranty) failed",
                ewiHttpStatus: httpStatus,
                ewiResponse: data,
                savedWarranty: updatedWarranty,
            });
        }

        // 10) Success
        return res.status(200).json({
            success: true,
            message:  "EWI Sale API (Get Warranty) hit successfully",
            ewiHttpStatus: httpStatus,
            ewiResponse: data,
            savedWarranty: updatedWarranty,
        });
    } catch (err) {
        // Update doc if it was created but API crashed
        if (warrantyDoc?._id) {
            await WarrantyModel.findByIdAndUpdate(warrantyDoc._id, {
                $set: {
                    thirdPartyResponse: {
                        status: "ERROR",
                        message: err?.message || "Unknown error",
                        stack: err?.stack || "",
                        failedAt: new Date().toISOString(),
                    },
                },
            }).catch(() => { });
        }

        return res.status(500).json({
            success: false,
            message: "Error hitting EWI Sale API (Get Warranty)",
            error: err?.message || String(err),
        });
    }
};



// ======================= EWI Sale API For RSA =======================
exports.ewiSaleApiForRSA = async (req, res) => {
    let warrantyDoc = null;

    try {
        if (!ewiSaleApiForRSAUrl || !ewiAuthorizationToken || !ewiXApiKey) {
            return res.status(500).json({
                success: false,
                message: "EWI Sale API (RSA) credentials are missing in environment variables",
            });
        }

        // 1) Prepare data for your Warranty schema (only schema fields)
        const payloadToSave = {
            carImageUrl: req.body.carImageUrl || "",
            appointmentId: (req.body.appointmentId || "").trim(),
            warrantyPrice: Number(req.body.warrantyPrice || 0),
            paymentId: req.body.paymentId || "",
            apiHitThrough: req.body.apiHitThrough || "",
            userId: req.body.userId || "",
            carId: req.body.carId || "",

            // Api Req Body Fields (schema)
            userName: req.body.userName || "Otobix",
            name: req.body.name || "",
            address: req.body.address || "",
            mobile: req.body.mobile || "",
            email: req.body.email || "",
            vehicleRegDate: req.body.vehicleRegDate || "",

            dealerName: req.body.dealerName || "Otobix",
            areaOffice: req.body.areaOffice || "",
            chassisNo: req.body.chassisNo || "",
            engineNo: req.body.engineNo || "",
            make: req.body.make || "",
            model: req.body.model || "",
            warrantyCover: req.body.warrantyCover || "",
            warrantyPeriod: req.body.warrantyPeriod || "",
            vehicleCc: req.body.vehicleCc || "",
            regNo: req.body.regNo || "",
            odometer: req.body.odometer || "",

            // RSA fields (optional)
            policyHolderName: req.body.policyHolderName || "",
            fullBillingAddress: req.body.fullBillingAddress || "",
            warrantySaleDate: req.body.warrantySaleDate || "",

            // NEW: dummy response at logging time
            thirdPartyResponse: {
                status: "Pending",
                message: "Sale API (RSA) call not executed yet",
                createdAt: new Date().toISOString(),
            },
        };

        // 2) Minimal validation (adjust as per your business rules)
        if (!payloadToSave.appointmentId) {
            return res.status(400).json({ success: false, message: "appointmentId is required" });
        }
        if (!payloadToSave.regNo) {
            return res.status(400).json({ success: false, message: "regNo is required" });
        }
        if (!payloadToSave.chassisNo) {
            return res.status(400).json({ success: false, message: "chassisNo is required" });
        }

        // 3) Create Warranty doc first (LOGGING)
        warrantyDoc = await WarrantyModel.create(payloadToSave);

        // 4) Build third-party payload EXACTLY as they require
        const thirdPartyPayload = {
            // username: payloadToSave.userName,
            name: payloadToSave.name,
            address: payloadToSave.address,
            mobile: payloadToSave.mobile,
            email: payloadToSave.email,

            VehicleReg: payloadToSave.vehicleRegDate,
            DealerName: payloadToSave.dealerName,
            Areaoffice: payloadToSave.areaOffice,
            ChassisNo: payloadToSave.chassisNo,
            EngineNo: payloadToSave.engineNo,
            Make: payloadToSave.make,
            Model: payloadToSave.model,
            // WarrantyCover: payloadToSave.warrantyCover,
            // WarrantyPeriod: payloadToSave.warrantyPeriod,
            // VehicleCC: payloadToSave.vehicleCc,
            RegNo: payloadToSave.regNo,
            // Odometer: payloadToSave.odometer,
            WarrantySaleDate: payloadToSave.warrantySaleDate,
        };

        // 5) Hit third-party Sale API
        const ewiRes = await axios.post(ewiSaleApiForRSAUrl, thirdPartyPayload, {
            headers: {
                Authorization: ewiAuthorizationToken,
                "X-API-Key": ewiXApiKey,
                ...(ewiCookie ? { Cookie: ewiCookie } : {}),
                "Content-Type": "application/json",
            },
            timeout: 30000,
            validateStatus: () => true,
        });

        const httpStatus = ewiRes.status;
        const data = ewiRes.data || {};

        // 6) Update Warranty doc with ACTUAL third-party response
        // Store full response + useful metadata (no schema change needed because thirdPartyResponse is Object)
        const updatedWarranty = await WarrantyModel.findByIdAndUpdate(
            warrantyDoc._id,
            {
                $set: {
                    thirdPartyResponse: {
                        httpStatus,
                        response: data,
                        receivedAt: new Date().toISOString(),
                    },
                },
            },
            { new: true }
        );

// 7) Treat 200/201 as success
const isSuccess = httpStatus === 200 || httpStatus === 201 ;

  // 8) Already exists
        if(httpStatus === 409){
        return res.status(409).json({
            success: true,
            message: "RSA already exists",
            ewiHttpStatus: httpStatus,
            ewiResponse: data,
            savedWarranty: updatedWarranty,
        });
        }

// 9) If third party failed
if (!isSuccess) {
            return res.status(502).json({
                success: false,
                message: "EWI Sale API (RSA) failed",
                ewiHttpStatus: httpStatus,
                ewiResponse: data,
                savedWarranty: updatedWarranty,
            });
        }

      

        // 10) Success
        return res.status(200).json({
            success: true,
            message:  "EWI Sale API (RSA) hit successfully",
            ewiHttpStatus: httpStatus,
            ewiResponse: data,
            savedWarranty: updatedWarranty,
        });
    } catch (err) {
        // Update doc if it was created but API crashed
        if (warrantyDoc?._id) {
            await WarrantyModel.findByIdAndUpdate(warrantyDoc._id, {
                $set: {
                    thirdPartyResponse: {
                        status: "ERROR",
                        message: err?.message || "Unknown error",
                        stack: err?.stack || "",
                        failedAt: new Date().toISOString(),
                    },
                },
            }).catch(() => { });
        }

        return res.status(500).json({
            success: false,
            message: "Error hitting EWI Sale API (RSA)",
            error: err?.message || String(err),
        });
    }
};




// // ======================= Request Ewi =======================
// exports.requestEwi = async (req, res) => {
//     let logDoc = null;

//     try {
//         // REQUIRED from your system
//         const { appointmentId, RegNo, ChassisNo } = req.body;

//         // if (!appointmentId || !String(appointmentId).trim()) {
//         //     return res.status(400).json({
//         //         success: false,
//         //         message: "appointmentId is required",
//         //     });
//         // }

//         if (!ewiRequestUrl || !ewiAuthorizationToken || !ewiXApiKey) {
//             return res.status(500).json({
//                 success: false,
//                 message: "EWI credentials are missing in environment variables",
//             });
//         }

//         // 1) Create initial DB log (so you always have trace)
//         logDoc = await EwiIntegrationModel.create({
//             appointmentId: appointmentId ? String(appointmentId).trim() : "",
//             registrationNumber: RegNo ? String(RegNo).trim() : "",
//             status: "Pending",
//             apiType: "Ewi Request",
//             message: `Request started${ChassisNo ? ` | ChassisNo: ${ChassisNo}` : ""}`,
//         });

//         // 2) Call EWI
//         const ewiRes = await axios.post(ewiRequestUrl, req.body, {
//             headers: {
//                 Authorization: ewiAuthorizationToken, // must match postman
//                 "X-API-Key": ewiXApiKey,
//                 ...(ewiCookie ? { Cookie: ewiCookie } : {}),
//                 "Content-Type": "application/json",
//             },
//             timeout: 30000,
//             validateStatus: () => true, // handle non-2xx manually
//         });

//         // 3) Parse EWI response
//         const data = ewiRes.data || {};
//         const httpStatus = ewiRes.status;

//         const inspectionId =
//             data.InspectionId ||
//             data.inspectionId ||
//             data.InspectionID ||
//             data.InspectionNo ||
//             "";

//         // EWI returns appointment-id with a hyphen
//         const ewiAppointmentId = data["appointment-id"] || data.appointmentId || "";

//         const messageText =
//             data.message ||
//             data.Message ||
//             data.msg ||
//             `EWI responded with HTTP ${httpStatus}`;

//         const statusText =
//             data.status ||
//             data.Status ||
//             (httpStatus >= 200 && httpStatus < 300 ? "Submitted" : "Failed");

//         const warrantyCover = data.WarrantyCover || req.body.WarrantyCover || "";
//         const warrantyPeriod = data.WarrantyPeriod || req.body.WarrantyPeriod || "";
//         const programeType = data.ProgrameType || req.body.ProgrameType || "";

//         // 4) Update DB log with response data
//         const updatedLog = await EwiIntegrationModel.findByIdAndUpdate(
//             logDoc._id,
//             {
//                 $set: {
//                     inspectionId: inspectionId ? String(inspectionId).trim() : "",
//                     // If your schema does NOT have ewiAppointmentId, remove this line
//                     ewiAppointmentId: ewiAppointmentId ? String(ewiAppointmentId).trim() : "",
//                     message: String(messageText || "").trim(),
//                     warrantyCover: String(warrantyCover || "").trim(),
//                     warrantyPeriod: String(warrantyPeriod || "").trim(),
//                     programeType: String(programeType || "").trim(),
//                     status: String(statusText || "").trim(),
//                     apiType: "Ewi Request",
//                 },
//             },
//             { new: true }
//         );

//         // 5) Respond to client
//         if (httpStatus < 200 || httpStatus >= 300) {
//             return res.status(502).json({
//                 success: false,
//                 message: "EWI request failed",
//                 ewiHttpStatus: httpStatus,
//                 ewiResponse: data,
//                 log: updatedLog,
//             });
//         }

//         return res.status(200).json({
//             success: true,
//             message: "EWI request submitted successfully",
//             ewiHttpStatus: httpStatus,
//             ewiResponse: data,
//             log: updatedLog,
//         });
//     } catch (err) {
//         console.error("Error requesting ewi:", err?.message || err);

//         // update DB log if created
//         if (logDoc?._id) {
//             await EwiIntegrationModel.findByIdAndUpdate(logDoc._id, {
//                 $set: {
//                     status: "ERROR",
//                     message: err?.message || "Unknown error",
//                 },
//             }).catch(() => { });
//         }

//         return res.status(500).json({
//             success: false,
//             message: "Error requesting ewi.",
//             error: err?.message || String(err),
//         });
//     }
// };


