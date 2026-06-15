// EWI Automation (Easy Notes)

// What this does:
// Main API se data aata hai. System car ki age aur kilometers dekh kar decide karta hai ke EWI API hit karni hai ya nahi. Main API kabhi bhi block nahi hoti — EWI background me chalti hai.

// 1) Required cheezen (Main API se)

// Main API ko yeh 2 cheezen zaroor deni hain:

// registrationDate (car ki registration date)

// odometerReading (car ki total kms)

// Baaki jo third-party EWI ko fields chahiye (Make, Model, etc.) wo bhi main API se field by field map karke bheje jaate hain.

// 2) WarrantyCover ka rule (conditions)
// ✅ Case 1

// Agar car 7 years se choti ho
// AND kms 100,000 ya us se kam ho
// ➡️ WarrantyCover = "Comprehensive"
// ➡️ EWI API hit hogi

// ✅ Case 2

// Agar car 7 years se zyada ho lekin 10 se kam ho
// AND kms 125,000 ya us se kam ho
// ➡️ WarrantyCover = "Engine & Transmission"
// ➡️ EWI API hit hogi

// ❌ Case 3 (Skip)

// Agar car 10 years ya us se zyada ho
// OR kms 125,000 se zyada ho
// ➡️ EWI API hit nahi hogi (skip)

// ❌ Extra (Safety)

// Agar registrationDate ya odometerReading missing/invalid ho
// ➡️ EWI skip

// Note: Exactly 7 years wala case wording me clear nahi hai (under 7 vs over 7), isliye currently wo skip treat hota hai (agar chaho to change kar sakte ho).

// 3) WarrantyCover body se nahi lena

// Main API/body me agar WarrantyCover aaya bhi ho, ignore hota hai.

// System khud rules se WarrantyCover set karta hai.

// 4) Logging (EwiIntegration collection me kya save hota hai)
// ✅ Log hamesha banta hai (chahe API hit ho ya skip)

// Sab se pehle ek log create hota hai:

// status = "Pending"

// message = "Rule check started"

// Agar skip hua:

// Log update hota hai:

// status = "Skipped"

// message = skip reason
// (example: “Over 10 years OR over 125,000 kms”)

// Agar API hit hui:

// message = "Request started"

// Response aane ke baad log update:

// status = "Submitted" (success)

// status = "Failed" (non-2xx response)

// status = "ERROR" (exception / crash)

// Response se values bhi store hoti hain:

// inspectionId, ewiAppointmentId (agar aaye)

// response message

// WarrantyCover, WarrantyPeriod, ProgrameType

// 5) Main API kabhi block nahi hoti

// Main API response immediately return karti hai.

// EWI background me chalti hai.

// EWI success/fail se main API na rukti hai na fail hoti hai.







// Helper Functions/request_ewi_certification_api_helper.js
'use strict';

const mongoose = require('mongoose');
const CarModel = require('../Models/carModel');
const axios = require('axios');
const EwiIntegrationModel = require('../Models/ewiIntegrationModel'); 
const PremiumVehiclesWarrantyPricesModel = require('../Models/premiumVehiclesWarrantyPricesModel');

const ewiRequestUrl = process.env.EWI_REQUEST_URL;
const ewiAuthorizationToken = process.env.EWI_AUTHORIZATION_TOKEN;
const ewiXApiKey = process.env.EWI_X_API_KEY;
const ewiCookie = process.env.EWI_COOKIE; // optional

// -------------------- Helpers --------------------

function normalizeText(v) {
  return (v || '').toString().trim().toUpperCase();
}

async function isPremiumCar(make, model) {
  const m = normalizeText(make);
  const md = normalizeText(model);

  if (!m || !md) return false;

  const doc = await PremiumVehiclesWarrantyPricesModel.findOne(
    { make: m, model: md },
    { _id: 1 }
  ).lean();

  return !!doc;
}


function isValidDate(d) {
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Accurate age in years with month/day precision
 */
function calculateCarAgeYears(registrationDate, now = new Date()) {
  const reg = new Date(registrationDate);
  if (!isValidDate(reg)) return null;

  let years = now.getFullYear() - reg.getFullYear();

  const hasNotHadAnniversaryThisYear =
    now.getMonth() < reg.getMonth() ||
    (now.getMonth() === reg.getMonth() && now.getDate() < reg.getDate());

  if (hasNotHadAnniversaryThisYear) years -= 1;

  if (years < 0) return null; // future date invalid
  return years;
}

/**
 * Your rules:
 * 1) age < 7 && kms <= 100000 => Comprehensive
 * 2) age > 7 && age < 10 && kms <= 125000 => Engine & Transmission
 * 3) age >= 10 OR kms > 125000 => SKIP
 *
 * Note: exactly 7 years is not covered by your wording ("under 7" vs "over 7"),
 * so this code treats it as "skip". You can change if needed.
 */
async function getWarrantyDecision({ registrationDate, odometerReading, make, model }) {
  const kms = Number(odometerReading);
  const ageYears = calculateCarAgeYears(registrationDate);

  if (ageYears === null || !Number.isFinite(kms)) {
    return { eligible: false, reason: 'Missing/invalid registrationDate or odometerReading' };
  }

  const premium = await isPremiumCar(make, model);

  if (premium) {
    // Premium: Only allow if under 7 years AND <= 100000 kms
    if (ageYears < 7 && kms <= 100000) {
      return { eligible: true, warrantyCover: 'Comprehensive', ageYears, kms, isPremium: true };
    }

    return {
      eligible: false,
      reason: 'Premium car rule: allowed only under 7 years AND under 100,000 kms',
      ageYears,
      kms,
      isPremium: true,
    };
  }

  // Rule 3 hard skip
  if (ageYears >= 10 || kms > 125000) {
    return { eligible: false, reason: 'Over 10 years OR over 125,000 kms', ageYears, kms };
  }

  // Rule 1
  if (ageYears < 7 && kms <= 100000) {
    return { eligible: true, warrantyCover: 'Comprehensive', ageYears, kms };
  }

  // Rule 2
  if (ageYears > 7 && ageYears < 10 && kms <= 125000) {
    return { eligible: true, warrantyCover: 'Engine & Transmission', ageYears, kms };
  }

  return {
    eligible: false,
    reason: `Not matching warranty rules (ageYears=${ageYears}, kms=${kms})`,
    ageYears,
    kms,
  };
}

/**
 * Call EWI and update SAME logId.
 * Never throws to caller (always returns result object).
 */
async function requestEwiSafely(payload, logId) {
  try {
    if (!ewiRequestUrl || !ewiAuthorizationToken || !ewiXApiKey) {
      if (logId) {
        await EwiIntegrationModel.findByIdAndUpdate(logId, {
          $set: { status: 'ERROR', message: 'EWI credentials missing in env' },
        }).catch(() => {});
      }
      return { attempted: true, success: false, error: 'EWI credentials missing in env' };
    }

    // Mark request started
    if (logId) {
      await EwiIntegrationModel.findByIdAndUpdate(logId, {
        $set: { status: 'Pending', message: 'Request started', requestBody: payload },
      }).catch(() => {});
    }

    // console.log('[EWI PAYLOAD SENT]', payload);

    const ewiRes = await axios.post(ewiRequestUrl, payload, {
      headers: {
        Authorization: ewiAuthorizationToken,
        'X-API-Key': ewiXApiKey,
        ...(ewiCookie ? { Cookie: ewiCookie } : {}),
        'Content-Type': 'application/json',
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    // console.log('[EWI RESPONSE]', ewiRes);

    const data = ewiRes.data || {};
    const httpStatus = ewiRes.status;

    const inspectionId =
      data.InspectionId ||
      data.inspectionId ||
      data.InspectionID ||
      data.InspectionNo ||
      '';

    const ewiAppointmentId = data['appointment-id'] || data.appointmentId || '';

    const messageText =
      data.message ||
      data.Message ||
      data.msg ||
      `EWI responded with HTTP ${httpStatus}`;

    const statusText =
      data.status ||
      data.Status ||
      (httpStatus >= 200 && httpStatus < 300 ? 'Submitted' : 'Failed');

    const warrantyCover = data.WarrantyCover || payload.WarrantyCover || '';
    const warrantyPeriod = data.WarrantyPeriod || payload.WarrantyPeriod || '';
    const programeType = data.ProgrameType || payload.ProgrameType || '';

    const updatedLog = logId
      ? await EwiIntegrationModel.findByIdAndUpdate(
          logId,
          {
            $set: {
              inspectionId: inspectionId ? String(inspectionId).trim() : '',
              ewiAppointmentId: ewiAppointmentId ? String(ewiAppointmentId).trim() : '',
              message: String(messageText || '').trim(),
              warrantyCover: String(warrantyCover || '').trim(),
              warrantyPeriod: String(warrantyPeriod || '').trim(),
              programeType: String(programeType || '').trim(),
              status: String(statusText || '').trim(),
              apiType: 'Ewi Request',
            },
          },
          { new: true }
        )
      : null;

    if (httpStatus < 200 || httpStatus >= 300) {
      return {
        attempted: true,
        success: false,
        ewiHttpStatus: httpStatus,
        ewiResponse: data,
        log: updatedLog,
      };
    }

    return {
      attempted: true,
      success: true,
      ewiHttpStatus: httpStatus,
      ewiResponse: data,
      log: updatedLog,
    };
  } catch (err) {
    if (logId) {
      await EwiIntegrationModel.findByIdAndUpdate(logId, {
        $set: { status: 'ERROR', message: err?.message || 'Unknown error' },
      }).catch(() => {});
    }

    return { attempted: true, success: false, error: err?.message || String(err) };
  }
}

/**
 * Main entry:
 * - always creates a log
 * - decides skip/eligible
 * - if skip: updates log with status Skipped + reason
 * - if eligible: forces WarrantyCover and calls EWI
 */
async function maybeRequestEwiByRules(input) {
  // 1) Create log always
  const logDoc = await EwiIntegrationModel.create({
    appointmentId: input.appointmentId ? String(input.appointmentId).trim() : '',
    registrationNumber: input.RegNo ? String(input.RegNo).trim().toUpperCase() : '',
    status: 'Pending',
    apiType: 'Ewi Request',
    message: 'Rule check started',
  });

  // 2) Decide warranty
  const decision = await getWarrantyDecision({
    registrationDate: input.registrationDate, // Date/ISO
    odometerReading: input.odometerReading,   // Number
     make: input.Make, // String
  model: input.Model, // String
  });

  // 3) If skip => update log and return
  if (!decision.eligible) {
    const updatedLog = await EwiIntegrationModel.findByIdAndUpdate(
      logDoc._id,
      {
        $set: {
          status: 'Skipped',
          apiType: 'Ewi Request',
          message: String(decision.reason || 'Skipped by rules'),
          requestBody: input,
        },
      },
      { new: true }
    );

    return {
      attempted: false,
      skipped: true,
      reason: decision.reason,
      ageYears: decision.ageYears,
      kms: decision.kms,
      log: updatedLog,
    };
  }

  // 4) Eligible => force WarrantyCover (ignore any incoming value)
  const payload = {
    ...input,
    WarrantyCover: decision.warrantyCover,
  };

  // delete possible variants if caller had them
  delete payload.warrantyCover;
  delete payload.warranty_cover;

  // 5) Call EWI and update same log
  const result = await requestEwiSafely(payload, logDoc._id);

  return {
    ...result,
    skipped: false,
    appliedWarrantyCover: decision.warrantyCover,
    ageYears: decision.ageYears,
    kms: decision.kms,
  };
}

/**
 * Fire-and-forget runner for your main API.
 * (Main API must not wait / not fail)
 */
function runEwiInBackground(input) {
  void maybeRequestEwiByRules(input)
    .then((r) => {
      console.log('[EWI background]', {
        attempted: r.attempted,
        skipped: r.skipped,
        success: r.success,
        reason: r.reason,
        appliedWarrantyCover: r.appliedWarrantyCover,
      });
    })
    .catch((e) => {
      // should not happen often because maybeRequestEwiByRules is safe,
      // but keep to avoid unhandled rejection
      console.error('[EWI background crash]', e);
    });
}



// ✅ Build payload from CarModel DOC (sync / pure function)
function buildEwiPayloadFromCarDoc(main) {
  if (!main) return null;

  // helpers
  const resolveField = (options, fallback = 'N/A') => {
  for (const opt of options) {
    if (opt === null || opt === undefined) continue;

    // If it's an array → convert to comma string
    if (Array.isArray(opt)) {
      const cleaned = opt
        .filter(v => v !== null && v !== undefined)
        .map(v => String(v).trim())
        .filter(v => v.length > 0);

      if (cleaned.length) return cleaned.join(', ');
    }

    // Handle ONLY real numbers (not numeric strings)
if (typeof opt === 'number' && Number.isFinite(opt)) {
  return String(opt);
}

    // If it's a string/number
    const str = String(opt).trim();
    if (str.length > 0) return str;
  }

  return fallback;
};
  const dateYYYMMDD = (v, d = 'N/A') => {
    const dt = v ? new Date(v) : null;
    return dt && !isNaN(dt.getTime()) ? dt.toISOString().slice(0, 10) : d;
  };
  const compressorOrWorking = (v) => {
    const s = v === null || v === undefined ? "N/A" : String(v);
    return s.toLowerCase().includes("compressor") ? s : "Working";
  };
  const hornNotWorking = (v) => {
    const s = v === null || v === undefined ? "N/A" : String(v);
    return s.toLowerCase().includes("horn not working") ? s : "Okay";
  };
  const absWarningLightGlowingList = (list, d = 'Okay') => {
    if (!Array.isArray(list) || list.length === 0) return d;
  
    const hasGlowing = list
      .filter((v) => v !== null && v !== undefined)
      .some((v) => String(v).trim().toLowerCase() === 'abs warning light glowing');
  
    return hasGlowing ? 'Glowing' : 'Okay';
  };
  const acceleratorOrWorking = (list) => {
    if (!Array.isArray(list)) return "Working";
  
    const match = list
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v).trim())
      .find((v) => v.length > 0 && v.toLowerCase().includes("accelerator"));
  
    return match ? match : "Working";
  };
  const centralLockOrWorking = (list) => {
    if (!Array.isArray(list)) return "Working";
  
    const match = list
      .filter((v) => v !== null && v !== undefined)
      .map((v) => String(v).trim())
      .find((v) => v.length > 0 && v.toLowerCase().includes("central lock not working"));
  
    return match ? match : "Working";
  };
  
  // ✅ GOOD / Direct matches (filled from your car doc)
  const ewiPayload = {
    // Required identifiers
    appointmentId: resolveField([main.appointmentId]),
    ChassisNo: resolveField([main.chassisNumber]),
    RegNo: resolveField([main.registrationNumber]).toUpperCase(),
  
    // Customer info
    username: resolveField([main.registeredOwner]),
    Areaoffice: resolveField([main.inspectionCity, main.city]),
    CustomerName: resolveField([main.registeredOwner]),
    address: resolveField([main.registeredAddressAsPerRc]),
    mobile: resolveField([main.contactNumber]),
  
    // Vehicle basic
    Make: resolveField([main.make]),
    Model: resolveField([main.model]),
    Varient: resolveField([main.variant]),
    CityRegistration: resolveField([main.registeredRto]),
    Colour: resolveField([main.color]),
  
    // thirdparty expects Odometer string
    Odometer: resolveField([main.odometerReadingBeforeTestDrive, main.odometerReadingInKms]),
  
    VehicleRegiteredAs: resolveField([main.registrationType]),
    FuelType: resolveField([main.fuelType]),
  
    ManufacturingYears: (() => {
    const d = main.yearAndMonthOfManufacture ?? main.yearMonthOfManufacture;
    if (!d) return '';
    const dt = new Date(d);
    return isNaN(dt.getTime()) ? '' : String(dt.getUTCFullYear());
    })(),

    VehicleReg: dateYYYMMDD(main.registrationDate, ''),
  
    EngineNo: resolveField([main.engineNumber]),
    NoOfOwner: resolveField([main.ownerSerialNumber]),
  
    CarUnderHypothecation: resolveField([main.hypothecationDetails]),
    NOC: resolveField([main.rtoNoc]),
  
    // Body panels
    Bonnet_Hood: resolveField([main.bonnetDropdownList, main.bonnet]),
    FrontBumper: resolveField([main.frontBumperDropdownList, main.frontBumper]),
    RearBumper: resolveField([main.rearBumperDropdownList, main.rearBumper]),
    DickyBoot: resolveField([main.bootDoorDropdownList, main.bootDoor]),
  
    FrontRHFender: resolveField([main.rhsFenderDropdownList, main.rhsFender]),
    FrontLHFender: resolveField([main.lhsFenderDropdownList, main.lhsFender]),
  
    RearRHQuarterPannel: resolveField([main.rhsQuarterPanelDropdownList, main.rhsQuarterPanel]),
    RearLHQuarterPannel: resolveField([main.lhsQuarterPanelDropdownList, main.lhsQuarterPanel]),
  
    DoorFRRH: resolveField([main.rhsFrontDoorDropdownList, main.rhsFrontDoor]),
    DoorFRLH: resolveField([main.lhsFrontDoorDropdownList, main.lhsFrontDoor]),
    DoorRRRH: resolveField([main.rhsRearDoorDropdownList, main.rhsRearDoor]),
    DoorRRLH: resolveField([main.lhsRearDoorDropdownList, main.lhsRearDoor]),
  
    A_PillarFRRH: resolveField([main.rhsAPillarDropdownList, main.rhsAPillar]),
    A_PillarFRLH: resolveField([main.lhsAPillarDropdownList, main.lhsAPillar]),
  
    B_PillarFRRH: resolveField([main.rhsBPillarDropdownList, main.rhsBPillar]),
    B_PillarFRLH: resolveField([main.lhsBPillarDropdownList, main.lhsBPillar]),
  
    C_PillarFRRH: resolveField([main.rhsCPillarDropdownList, main.rhsCPillar]),
    C_PillarFRLH: resolveField([main.lhsCPillarDropdownList, main.lhsCPillar]),
  
    RunningBoardFRRH: resolveField([main.rhsRunningBorderDropdownList, main.rhsRunningBorder]),
    RunningBoardFRLH: resolveField([main.lhsRunningBorderDropdownList, main.lhsRunningBorder]),
  
    // Engine bay + mechanical
    EngineCompartmentCondition: resolveField([main.engineDropdownList, main.engine]),
    EngineSound: resolveField([main.enginePermisableBlowByDropdownList, main.enginePermisableBlowBy]),
    EngineOilLevel: resolveField([main.engineOilLevelDipstickDropdownList, main.engineOilLevelDipstick]),
    EngineOilQuality: resolveField([main.engineOilDropdownList, main.engineOil]),
    ExhaustEmission: resolveField([main.exhaustSmokeDropdownList, main.exhaustSmoke]),
  
    BrakeFluid: resolveField([main.brakesDropdownList, main.brakes]),
    CoolantQuality_Quantity: resolveField([main.coolantDropdownList, main.coolant]),
  
    GearBoxCondition: resolveField([main.gearShiftDropdownList, main.gearShift]),
    Clutch: resolveField([main.clutchDropdownList, main.clutch]),
  
    // Interior / electricals
    Interior: resolveField([main.commentOnInteriorDropdownList, main.commentOnInterior]),
   Seat: (() => {
  const fabric = resolveField([main.fabricSeats], '');
  const leather = resolveField([main.leatherSeats], '');
  const fallback =
    fabric || leather
      ? `FabricSeats: ${fabric || 'N/A'} / LeatherSeats: ${leather || 'N/A'}`
      : 'N/A';
  return resolveField([main.seatsUpholstery], fallback);
})(),

    PowerWindow: Number(main.noOfPowerWindows) > 0 ? 'Yes' : 'No',
    PowerWindowOperation: (() => {
  const rhsF = resolveField([
    main.rhsFrontDoorFeaturesDropdownList,
    main.powerWindowConditionRhsFront
  ], '');
  const lhsF = resolveField([
    main.lhsFrontDoorFeaturesDropdownList,
    main.powerWindowConditionLhsFront
  ], '');
  const rhsR = resolveField([
    main.rhsRearDoorFeaturesDropdownList,
    main.powerWindowConditionRhsRear
  ], '');
  const lhsR = resolveField([
    main.lhsRearDoorFeaturesDropdownList,
    main.powerWindowConditionLhsRear
  ], '');
  const hasAny = rhsF || lhsF || rhsR || lhsR;
  return hasAny
    ? `RHSFront: ${rhsF || 'N/A'} / LHSFront: ${lhsF || 'N/A'} / RHSRear: ${rhsR || 'N/A'} / LHSRear: ${lhsR || 'N/A'}`
    : 'N/A';
})(),

    PowerSteering: main.steering ? 'Yes' : 'No',
    PowerSteeringOperation: resolveField([main.steeringDropdownList, main.steering]),
  
    NoAirBags: resolveField([main.noOfAirBags]),
    ABS: resolveField([main.abs]),
  
    RearParkingSystem: resolveField([main.reverseCameraDropdownList, main.reverseCamera]),
    SunRoof: resolveField([main.sunroofDropdownList, main.sunroof]),
  
    DisplayScreen: resolveField([main.steeringDropdownList, main.steering]),
    MusicSystem: resolveField([main.infotainmentSystemDropdownList, main.stereo]),
   
    AirCondition: resolveField([main.acCoolingDropdownList, main.airConditioningClimateControl]),
  
    Battery: resolveField([main.batteryDropdownList, main.battery]),
    Windshield: resolveField([main.frontWindshieldDropdownList, main.frontWindshield]),
    Suspension: resolveField([main.suspensionDropdownList, main.suspension]),
  
    // Tyres & alloys
    TyreFR: resolveField([main.rhsFrontTyreDropdownList, main.rhsFrontTyre]),
    TyreFL: resolveField([main.lhsFrontTyreDropdownList, main.lhsFrontTyre]),
    TyreRR: resolveField([main.rhsRearTyreDropdownList, main.rhsRearTyre]),
    TyreRF: resolveField([main.lhsRearTyreDropdownList, main.lhsRearTyre]),
  
    SpareTyre: resolveField([main.spareTyreDropdownList, main.spareTyre]),
  
    Wheel_RimFR: resolveField([main.rhsFrontWheelDropdownList, main.rhsFrontAlloy]),
    Wheel_RimFL: resolveField([main.lhsFrontWheelDropdownList, main.lhsFrontAlloy]),
    Wheel_RimRR: resolveField([main.rhsRearWheelDropdownList, main.rhsRearAlloy]),
    Wheel_RimRl: resolveField([main.lhsRearWheelDropdownList, main.lhsRearAlloy]),
  
    VehicleCC: resolveField([main.cubicCapacity]),
  
    TechnicianComments: resolveField([main.commentsOnExteriorDropdownList, main.comments]),
  
    WarrantyPeriod: '12 Months',
    ProgrameType: 'Extended Warranty',
  
    // Internal rule check
    registrationDate: main.registrationDate,
    odometerReading: (() => {
    const val = main.odometerReadingBeforeTestDrive ?? main.odometerReadingInKms;
    const num = Number(val);
    return Number.isFinite(num) ? num : undefined;
    })(), 

    };
  
  // ⚠️ NOT-GOOD / Not present in your car doc (set to empty string)
  Object.assign(ewiPayload, {
    DriveType: resolveField([main.driveTrainDropdownList]),
    GearBox: resolveField([main.commentsOnTransmissionDropdownList, main.commentsOnTransmission]),
    CNGLPG_Fitting: resolveField([main.fuelType]),
    CNGLPG_Endorsed: resolveField([main.additionalDetailsDropdownList, main.additionalDetails]),
    Compresor: compressorOrWorking(main.commentsOnAC),
    RadiatorFan: resolveField([main.commentsOnRadiatorDropdownList, main.commentsOnRadiator]),
    Radiator: resolveField([main.commentsOnRadiatorDropdownList, main.commentsOnRadiator]),
  GearBoxOperation: (() => {
  const gear = resolveField([main.gearShiftDropdownList, main.gearShift], '');
  const trans = resolveField([main.commentsOnTransmissionDropdownList, main.commentsOnTransmission], '');
  if (!gear && !trans) return 'N/A';
  return `GearShift: ${gear || 'N/A'} / CommentsOnTransmission: ${trans || 'N/A'}`;
})(),
    Pick_Up: resolveField([main.clutchDropdownList, main.clutch]),
    OperationBrake: resolveField([main.brakesDropdownList, main.brakes]),
    Immobiliser: resolveField([main.commentsOnClusterMeterDropdownList]),
    Heater: resolveField([main.commentsOnAC]),
    AutomaticTransmissionLight: resolveField([main.commentsOnClusterMeterDropdownList]),
    Alternator: resolveField([main.commentsOnEngineDropdownList, main.commentsOnEngine]),
    StartingCar: resolveField([main.commentsOnTowingDropdownList, main.commentsOnTowing]),
    MalfuctionLight: resolveField([main.commentsOnClusterMeterDropdownList]),
    TurboOption: resolveField([main.commentsOnEngineDropdownList, main.commentsOnEngine]),
    TurboOptionGearBoxType: resolveField([main.transmissionTypeDropdownList]),
    BrakePadLife: resolveField([main.brakesDropdownList, main.brakes]),
    EmissionType: resolveField([main.norms]),
    CarUnderWarranty: 'No', // Always No
    PowerSeat: resolveField([main.driverSeatDropdownList]),
    Horn: hornNotWorking( resolveField([ main.steeringMountedSystemControls, main.steeringMountedAudioControl ], '')),
    ABSLight: absWarningLightGlowingList(main.commentsOnClusterMeterDropdownList),
   LightHeadTail: (() => {
  const rhs = resolveField([main.rhsHeadlampDropdownList, main.rhsHeadlamp], '');
  const lhs = resolveField([main.lhsHeadlampDropdownList, main.lhsHeadlamp], '');
  if (!rhs && !lhs) return 'N/A';
  return `RHS Headlamp: ${rhs || 'N/A'} / LHS Headlamp: ${lhs || 'N/A'}`;
})(),
    SpareWheels: resolveField([main.spareTyreDropdownList, main.spareTyre]),
    ABCPadelOperation:  `A: ${acceleratorOrWorking(  
    Array.isArray(main.commentsOnOthersDropdownList) &&
    main.commentsOnOthersDropdownList.length > 0
    ? main.commentsOnOthersDropdownList
    : main.commentsOnOthers
    ? [main.commentsOnOthers]
    : [])} / B: ${resolveField([main.brakesDropdownList, main.brakes])} / C: ${resolveField([main.clutchDropdownList, main.clutch])}`,
    CentralLocking: centralLockOrWorking(
    Array.isArray(main.rhsFrontDoorFeaturesDropdownList) &&
    main.rhsFrontDoorFeaturesDropdownList.length > 0
    ? main.rhsFrontDoorFeaturesDropdownList
    : main.powerWindowConditionRhsFront
    ? [main.powerWindowConditionRhsFront]
    : [] ),
    BrakeFluidQuality: 'N/A',
    OwnerType: 'N/A',
    Type: 'N/A',
    Operation: 'N/A',
  });
  
  // Slight “closest” combine (optional): Apron from lhs/rhs
  ewiPayload.Apron = (() => {
  const lhs = resolveField([main.lhsApronDropdownList, main.lhsApron], '');
  const rhs = resolveField([main.rhsApronDropdownList, main.rhsApron], '');
  if (!lhs && !rhs) return 'N/A';
  return `LHS Apron: ${lhs || 'N/A'} / RHS Apron: ${rhs || 'N/A'}`;
})();
  
  return ewiPayload; // ✅ IMPORTANT
}


// ✅ Build payload from CAR ID (async)
async function buildEwiPayloadFromCarId(carId) {
  if (!carId) return null;

  // prevent CastError
  if (!mongoose.Types.ObjectId.isValid(carId)) {
    console.log('[EWI] Invalid carId:', carId);
    return null;
  }

  const main = await CarModel.findById(carId).lean();
  if (!main) {
    console.log('[EWI] Car not found for carId:', carId);
    return null;
  }

  return buildEwiPayloadFromCarDoc(main);
}

// ✅ SIMPLE: just call runEwiForCar("carIdString")
function runEwiForCar(carId) {
  try {
    // ensure main API never waits (runs after response cycle)
    setImmediate(() => {
      void buildEwiPayloadFromCarId(String(carId))
        .then((payload) => {
          if (!payload) return;
          runEwiInBackground(payload); // already safe + does not throw to caller
        })
        .catch((e) => console.error('[EWI runEwiForCar async error]', e));
    });
  } catch (e) {
    console.error('[EWI runEwiForCar sync error]', e);
  }
}

module.exports = {
  maybeRequestEwiByRules,
  runEwiInBackground,
  runEwiForCar,
};









// Backup if anything fails after changing we can use this previous logic again 
// // ✅ Build payload from CarModel DOC (sync / pure function)
// function buildEwiPayloadFromCarDoc(main) {
//   if (!main) return null;

//   // helpers
//   const toString = (v, d = 'N/A') => {
//     if (v === null || v === undefined) return d;
//     const s = String(v).trim();
//     return s.length === 0 ? d : s;
//   };
//   const numberToString = (v, d = 'N/A') => (Number.isFinite(Number(v)) ? String(Number(v)) : d);
//   const dateYYYMMDD = (v, d = 'N/A') => {
//     const dt = v ? new Date(v) : null;
//     return dt && !isNaN(dt.getTime()) ? dt.toISOString().slice(0, 10) : d;
//   };
//   const listToCommaString = (list, d = 'N/A') => {
//     if (!Array.isArray(list)) return d;
  
//     const cleaned = list
//       .filter((v) => v !== null && v !== undefined)
//       .map((v) => String(v).trim())
//       .filter((v) => v.length > 0);
  
//     return cleaned.length ? cleaned.join(', ') : d;
//   };
//   const compressorOrWorking = (v) => {
//     const s = v === null || v === undefined ? "N/A" : String(v);
//     return s.toLowerCase().includes("compressor") ? s : "Working";
//   };
//   const hornNotWorking = (v) => {
//     const s = v === null || v === undefined ? "N/A" : String(v);
//     return s.toLowerCase().includes("horn not working") ? s : "Okay";
//   };
//   const absWarningLightGlowingList = (list, d = 'Okay') => {
//     if (!Array.isArray(list) || list.length === 0) return d;
  
//     const hasGlowing = list
//       .filter((v) => v !== null && v !== undefined)
//       .some((v) => String(v).trim().toLowerCase() === 'abs warning light glowing');
  
//     return hasGlowing ? 'Glowing' : 'Okay';
//   };
//   const acceleratorOrWorking = (list) => {
//     if (!Array.isArray(list)) return "Working";
  
//     const match = list
//       .filter((v) => v !== null && v !== undefined)
//       .map((v) => String(v).trim())
//       .find((v) => v.length > 0 && v.toLowerCase().includes("accelerator"));
  
//     return match ? match : "Working";
//   };
//   const centralLockOrWorking = (list) => {
//     if (!Array.isArray(list)) return "Working";
  
//     const match = list
//       .filter((v) => v !== null && v !== undefined)
//       .map((v) => String(v).trim())
//       .find((v) => v.length > 0 && v.toLowerCase().includes("central lock not working"));
  
//     return match ? match : "Working";
//   };
  
//   // ✅ GOOD / Direct matches (filled from your car doc)
//   const ewiPayload = {
//     // Required identifiers
//     appointmentId: toString(main.appointmentId),
//     ChassisNo: toString(main.chassisNumber),
//     RegNo: toString(main.registrationNumber).toUpperCase(),
  
//     // Customer info
//     username: toString(main.registeredOwner),
//     Areaoffice: toString(main.inspectionCity) ?? toString(main.city),
//     CustomerName: toString(main.registeredOwner),
//     address: toString(main.registeredAddressAsPerRc),
//     mobile: toString(main.contactNumber),
  
//     // Vehicle basic
//     Make: toString(main.make),
//     Model: toString(main.model),
//     Varient: toString(main.variant),
//     CityRegistration: toString(main.registeredRto),
//     Colour: toString(main.color),
  
//     // thirdparty expects Odometer string
//     Odometer: numberToString(main.odometerReadingInKms, ''),
  
//     VehicleRegiteredAs: toString(main.registrationType),
//     FuelType: toString(main.fuelType),
  
//     ManufacturingYears: (() => {
//       const dt = main.yearMonthOfManufacture ? new Date(main.yearMonthOfManufacture) : null;
//       return dt && !isNaN(dt.getTime()) ? String(dt.getFullYear()) : '';
//     })(),
  
//     VehicleReg: dateYYYMMDD(main.registrationDate, ''),
  
//     EngineNo: toString(main.engineNumber),
//     NoOfOwner: numberToString(main.ownerSerialNumber, ''),
  
//     // Hypothecation rule: if not empty => Yes else No
//     CarUnderHypothecation: main.hypothecationDetails ? 'Yes' : 'No',
//     NOC: toString(main.rtoNoc),
  
//     // Body panels
//     Bonnet_Hood: listToCommaString(main.bonnetDropdownList),
//     FrontBumper: listToCommaString(main.frontBumperDropdownList),
//     RearBumper: listToCommaString(main.rearBumperDropdownList),
//     DickyBoot: listToCommaString(main.bootDoorDropdownList),
  
//     FrontRHFender: listToCommaString(main.rhsFenderDropdownList),
//     FrontLHFender: listToCommaString(main.lhsFenderDropdownList),
  
//     RearRHQuarterPannel: listToCommaString(main.rhsQuarterPanelDropdownList),
//     RearLHQuarterPannel: listToCommaString(main.lhsQuarterPanelDropdownList),
  
//     DoorFRRH: listToCommaString(main.rhsFrontDoorDropdownList),
//     DoorFRLH: listToCommaString(main.lhsFrontDoorDropdownList),
//     DoorRRRH: listToCommaString(main.rhsRearDoorDropdownList),
//     DoorRRLH: listToCommaString(main.lhsRearDoorDropdownList),
  
//     A_PillarFRRH: listToCommaString(main.rhsAPillarDropdownList),
//     A_PillarFRLH: listToCommaString(main.lhsAPillarDropdownList),
  
//     B_PillarFRRH: listToCommaString(main.rhsBPillarDropdownList),
//     B_PillarFRLH: listToCommaString(main.lhsBPillarDropdownList),
  
//     C_PillarFRRH: listToCommaString(main.rhsCPillarDropdownList),
//     C_PillarFRLH: listToCommaString(main.lhsCPillarDropdownList),
  
//     RunningBoardFRRH: listToCommaString(main.rhsRunningBorderDropdownList),
//     RunningBoardFRLH: listToCommaString(main.lhsRunningBorderDropdownList),
  
//     // Engine bay + mechanical
//     EngineCompartmentCondition: listToCommaString(main.engineDropdownList),
//     EngineSound: listToCommaString(main.enginePermisableBlowByDropdownList),
//     EngineOilLevel: listToCommaString(main.engineOilLevelDipstickDropdownList),
//     EngineOilQuality: listToCommaString(main.engineOilDropdownList),
//     ExhaustEmission: listToCommaString(main.exhaustSmokeDropdownList),
  
//     BrakeFluid: listToCommaString(main.brakesDropdownList),
//     CoolantQuality_Quantity: listToCommaString(main.coolantDropdownList),
  
//     GearBoxCondition: listToCommaString(main.gearShiftDropdownList),
//     Clutch: listToCommaString(main.clutchDropdownList),
  
//     // Interior / electricals
//     Interior: listToCommaString(main.commentOnInteriorDropdownList),
//     Seat: toString(main.seatsUpholstery),
  
//     PowerWindow: main.noOfPowerWindows ? 'Yes' : 'No',
//     PowerWindowOperation:
//       `RHSFront: ${listToCommaString(main.rhsFrontDoorFeaturesDropdownList)} / LHSFront: ${listToCommaString(main.lhsFrontDoorFeaturesDropdownList)} / RHSRear: ${listToCommaString(main.rhsRearDoorFeaturesDropdownList)} / LHSRear: ${listToCommaString(main.lhsRearDoorFeaturesDropdownList)}`,
  
//     PowerSteering: main.steering ? 'Yes' : 'No',
//     PowerSteeringOperation: listToCommaString(main.steeringDropdownList),
  
//     NoAirBags: numberToString(main.noOfAirBags, ''),
//     ABS: toString(main.abs),
  
//     RearParkingSystem: listToCommaString(main.reverseCameraDropdownList),
//     SunRoof: listToCommaString(main.sunroofDropdownList),
  
//     DisplayScreen: listToCommaString(main.steeringDropdownList),
//     MusicSystem: listToCommaString(main.infotainmentSystemDropdownList),
  
//     AirCondition: listToCommaString(main.acCoolingDropdownList),
  
//     Battery: listToCommaString(main.batteryDropdownList),
//     Windshield: listToCommaString(main.frontWindshieldDropdownList),
//     Suspension: listToCommaString(main.suspensionDropdownList),
  
//     // Tyres & alloys
//     TyreFR: listToCommaString(main.rhsFrontTyreDropdownList),
//     TyreFL: listToCommaString(main.lhsFrontTyreDropdownList),
//     TyreRR: listToCommaString(main.rhsRearTyreDropdownList),
//     TyreRF: listToCommaString(main.lhsRearTyreDropdownList),
  
//     SpareTyre: listToCommaString(main.spareTyreDropdownList),
  
//     Wheel_RimFR: listToCommaString(main.rhsFrontWheelDropdownList),
//     Wheel_RimFL: listToCommaString(main.lhsFrontWheelDropdownList),
//     Wheel_RimRR: listToCommaString(main.rhsRearWheelDropdownList),
//     Wheel_RimRl: listToCommaString(main.lhsRearWheelDropdownList),
  
//     VehicleCC: numberToString(main.cubicCapacity, ''),
  
//     TechnicianComments: listToCommaString(main.commentsOnExteriorDropdownList),
  
//     WarrantyPeriod: '12 Months',
//     ProgrameType: 'Extended Warranty',
  
//     // Internal rule check
//     registrationDate: main.registrationDate,
//     odometerReading: Number.isFinite(Number(main.odometerReadingInKms)) ? Number(main.odometerReadingInKms) : undefined,
//   };
  
//   // ⚠️ NOT-GOOD / Not present in your car doc (set to empty string)
//   Object.assign(ewiPayload, {
//     DriveType: listToCommaString(main.driveTrainDropdownList),
//     GearBox: listToCommaString(main.commentsOnTransmissionDropdownList),
//     CNGLPG_Fitting: toString(main.fuelType),
//     CNGLPG_Endorsed: listToCommaString(main.additionalDetailsDropdownList),
//     Compresor: compressorOrWorking(main.commentsOnAC),
//     RadiatorFan: listToCommaString(main.commentsOnRadiatorDropdownList),
//     Radiator: listToCommaString(main.commentsOnRadiatorDropdownList),
//     GearBoxOperation: `GearShift: ${listToCommaString(main.gearShiftDropdownList)} / CommentsOnTransmission: ${listToCommaString(main.commentsOnTransmissionDropdownList)}`,
//     Pick_Up: listToCommaString(main.clutchDropdownList),
//     OperationBrake: listToCommaString(main.brakesDropdownList),
//     Immobiliser: listToCommaString(main.commentsOnClusterMeterDropdownList),
//     Heater: toString(main.commentsOnAC),
//     AutomaticTransmissionLight: listToCommaString(main.commentsOnClusterMeterDropdownList),
//     Alternator: listToCommaString(main.commentsOnEngineDropdownList),
//     StartingCar: listToCommaString(main.commentsOnTowingDropdownList),
//     MalfuctionLight: listToCommaString(main.commentsOnClusterMeterDropdownList),
//     TurboOption: listToCommaString(main.commentsOnEngineDropdownList),
//     TurboOptionGearBoxType: listToCommaString(main.transmissionTypeDropdownList),
//     BrakePadLife: listToCommaString(main.brakesDropdownList),
//     EmissionType: toString(main.norms),
//     CarUnderWarranty: 'No', // Always No
//     PowerSeat: listToCommaString(main.driverSeatDropdownList),
//     Horn: hornNotWorking(main.steeringMountedSystemControls),
//     ABSLight: absWarningLightGlowingList(main.commentsOnClusterMeterDropdownList),
//     LightHeadTail: `RHS Headlamp: ${listToCommaString(main.rhsHeadlampDropdownList)} / LHS Headlamp: ${listToCommaString(main.lhsHeadlampDropdownList)}`,
//     SpareWheels: listToCommaString(main.spareTyreDropdownList),
//     ABCPadelOperation:  `A: ${acceleratorOrWorking(main.commentsOnOthersDropdownList)} / B: ${listToCommaString(main.brakesDropdownList)} / C: ${listToCommaString(main.clutchDropdownList)}`,
//     CentralLocking: centralLockOrWorking(main.rhsFrontDoorFeaturesDropdownList),
//     BrakeFluidQuality: 'N/A',
//     OwnerType: 'N/A',
//     Type: 'N/A',
//     Operation: 'N/A',
//   });
  
//   // Slight “closest” combine (optional): Apron from lhs/rhs
//   ewiPayload.Apron = `LHS Apron: ${listToCommaString(main.lhsApron)} / RHS Apron: ${listToCommaString(main.rhsApron)}`;
  
//   return ewiPayload; // ✅ IMPORTANT
// }
