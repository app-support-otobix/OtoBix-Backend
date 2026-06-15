// Helper Functions/get_warranty_options_helper.js
'use strict';

const CarModel = require('../Models/carModel'); // adjust path if needed
const EwiIntegrationModel = require('../Models/ewiIntegrationModel');
const PremiumVehiclesWarrantyPrices = require('../Models/premiumVehiclesWarrantyPricesModel'); // adjust file name/path

// -------------------- Small Error Helper --------------------
class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// -------------------- Normalizers --------------------
const normalizeRegNo = (val) => (val || '').toString().trim().toUpperCase();
const normalizeText = (val) => (val || '').toString().trim().toUpperCase();

const splitMulti = (val) => {
  return (val || '')
    .toString()
    .split(/[,|]/g)
    .map((x) => x.trim())
    .filter(Boolean);
};

// -------------------- DB Fetchers --------------------
const getCarByRegNo = async (registrationNumber) => {
  const regNo = normalizeRegNo(registrationNumber);

  const car = await CarModel.findOne({ registrationNumber: regNo })
    .sort({ updatedAt: -1 })
    .lean();

  if (!car) throw new ApiError(404, 'Car not found for this registration number.');
  return car;
};

const getApprovedEwiCallback = async (registrationNumber) => {
  const regNo = normalizeRegNo(registrationNumber);

  const ewi = await EwiIntegrationModel.findOne({
    registrationNumber: regNo,
    status: 'Approved',
    apiType: 'Ewi Callback',
  })
    .sort({ updatedAt: -1 })
    .lean();

  if (!ewi) {
    // you asked for a different status code when no approved callback exists
    throw new ApiError(422, 'This car can not get warranty (no Approved EWI callback found).');
  }

  return ewi;
};

const getPremiumPricingDocIfAny = async (make, model) => {
  const mk = normalizeText(make);
  const md = normalizeText(model);

  if (!mk || !md) return null;

  // exact match (case-insensitive by normalizing stored values is better)
  // Here we do a simple exact match; if your DB stores raw cases, consider storing uppercase in DB.
  const doc = await PremiumVehiclesWarrantyPrices.findOne({
    make: mk,
    model: md,
  }).lean();

  return doc || null;
};

// -------------------- Date/Age --------------------
const getCarAgeYears = (registrationDate) => {
  if (!registrationDate) return null;
  const d = new Date(registrationDate);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();

  // adjust if birthday not passed yet in the current year
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) years--;

  return years;
};

// -------------------- CC Bands --------------------
const getCcBand = (cc) => {
  const v = Number(cc);
  if (Number.isNaN(v)) return null;

  if (v <= 1299) return 'UPTO_1299';
  if (v >= 1300 && v <= 1599) return '1300_1599';
  if (v >= 1600 && v <= 1999) return '1600_1999';
  if (v >= 2000 && v <= 2499) return '2000_2499';
  return null;
};

// -------------------- EWI Options Logic --------------------
// Return which options are allowed based on EWI warrantyCover + warrantyPeriod
// Options keys we use internally:
//  - 6M_COMP, 12M_COMP, 6M_ET, 12M_ET
const getOptionsAllowedByEwi = (warrantyCoverRaw, warrantyPeriodRaw) => {
  const covers = splitMulti(warrantyCoverRaw).map(normalizeText);
  const periods = splitMulti(warrantyPeriodRaw).map(normalizeText);

  const hasComp = covers.some((c) => c.includes('COMPREHENSIVE'));
  const hasET = covers.some((c) => c.includes('ENGINE') || c.includes('TRANSMISSION'));

  const has6 = periods.some((p) => p.includes('6'));
  const has12 = periods.some((p) => p.includes('12'));

  // Rules you gave:
  // - 12M Comprehensive => all 4
  // - 6M Comprehensive  => all 3 except 12M Comprehensive
  // - 12M ET           => 12M ET + 6M ET
  // - 6M ET            => only 6M ET

  if (hasComp && has12) return new Set(['6M_COMP', '12M_COMP', '6M_ET', '12M_ET']);
  if (hasComp && has6) return new Set(['6M_COMP', '6M_ET', '12M_ET']);

  if (hasET && has12) return new Set(['6M_ET', '12M_ET']);
  if (hasET && has6) return new Set(['6M_ET']);

  // if data is weird/unrecognized
  return new Set();
};

// -------------------- Pricing Tables (Non-premium) --------------------
const PRICING_STD = {
  UPTO_1299: { '6M_ET': 2075, '12M_ET': 3370, '6M_COMP': 2999, '12M_COMP': 4975 },
  '1300_1599': { '6M_ET': 2599, '12M_ET': 4080, '6M_COMP': 3599, '12M_COMP': 5980 },
  '1600_1999': { '6M_ET': 3499, '12M_ET': 4735, '6M_COMP': 4999, '12M_COMP': 7075 },
  '2000_2499': { '6M_ET': 4099, '12M_ET': 5480, '6M_COMP': 5999, '12M_COMP': 8025 },
};

const PRICING_7_TO_10 = {
  UPTO_1299: { '6M_ET': 2599, '12M_ET': 4215 },
  '1300_1599': { '6M_ET': 3249, '12M_ET': 5099 },
  '1600_1999': { '6M_ET': 4375, '12M_ET': 5925 },
  '2000_2499': { '6M_ET': 5125, '12M_ET': 6850 },
};

// -------------------- Rule Engine --------------------
const determineRuleBucket = ({ isPremium, ageYears, odometer }) => {
  const odo = Number(odometer || 0);

  // Premium rule
  if (isPremium) {
    if (ageYears > 7 || odo > 100000) return 'NO_WARRANTY';
    return 'PREMIUM_OK';
  }

  // Non-premium rule
  if (ageYears > 10 || odo > 125000) return 'NO_WARRANTY';

  if (ageYears < 7 && odo <= 100000) return 'STD_OK';

  if (ageYears >= 7 && ageYears <= 10 && odo >= 100000 && odo <= 125000) return '7_TO_10_OK';

  // any other scenario not defined in your rules
  return 'NO_WARRANTY';
};

const allowedOptionsByBucket = (bucket) => {
  if (bucket === 'STD_OK' || bucket === 'PREMIUM_OK') {
    return new Set(['6M_COMP', '12M_COMP', '6M_ET', '12M_ET']);
  }
  if (bucket === '7_TO_10_OK') {
    return new Set(['6M_ET', '12M_ET']);
  }
  return new Set(); // NO_WARRANTY
};

const mapOptionToResponse = (optionKey, price) => {
  if (optionKey === '6M_COMP') return { warrantyCover: 'Comprehensive', warrantyPeriod: '6 Months', warrantyPrice: price };
  if (optionKey === '12M_COMP') return { warrantyCover: 'Comprehensive', warrantyPeriod: '12 Months', warrantyPrice: price };
  if (optionKey === '6M_ET') return { warrantyCover: 'Engine & Transmission', warrantyPeriod: '6 Months', warrantyPrice: price };
  if (optionKey === '12M_ET') return { warrantyCover: 'Engine & Transmission', warrantyPeriod: '12 Months', warrantyPrice: price };
  return null;
};

const buildOptions = ({ ewiAllowedOptions, bucket, ccBand, premiumDoc }) => {
  const bucketAllowed = allowedOptionsByBucket(bucket);

  // intersection: EWI options ∩ bucket options
  const finalOptionKeys = [...ewiAllowedOptions].filter((k) => bucketAllowed.has(k));

  if (finalOptionKeys.length === 0) return [];

  const out = [];

  for (const key of finalOptionKeys) {
    let price = null;

    // Premium pricing comes from premium doc fields
    if (bucket === 'PREMIUM_OK' && premiumDoc) {
      if (key === '6M_COMP') price = premiumDoc['6MonthsComprehensive'];
      if (key === '12M_COMP') price = premiumDoc['12MonthsComprehensive'];
      if (key === '6M_ET') price = premiumDoc['6MonthsEngineTransmission'];
      if (key === '12M_ET') price = premiumDoc['12MonthsEngineTransmission'];
    }

    // Non-premium pricing from tables
    if (bucket === 'STD_OK') {
      price = PRICING_STD?.[ccBand]?.[key] ?? null;
    }

    if (bucket === '7_TO_10_OK') {
      // only ET options exist here
      price = PRICING_7_TO_10?.[ccBand]?.[key] ?? null;
    }

    if (!price || Number(price) <= 0) continue;

    const row = mapOptionToResponse(key, Number(price));
    if (row) out.push(row);
  }

  return out;
};

// -------------------- Main Orchestrator --------------------
const getWarrantyOptionsForCar = async (registrationNumber) => {
  const regNo = normalizeRegNo(registrationNumber);
  if (!regNo) throw new ApiError(400, 'Registration number is required.');

  const car = await getCarByRegNo(regNo);
  const ewi = await getApprovedEwiCallback(regNo);

  const ageYears = getCarAgeYears(car.registrationDate);
  if (ageYears === null) throw new ApiError(400, 'Car registrationDate is missing or invalid.');

  const ccBand = getCcBand(car.cubicCapacity);
  if (!ccBand) throw new ApiError(400, 'Car cubicCapacity is missing/invalid or out of supported range (upto 2499cc).');

  const odo = Number(car.odometerReadingInKms || 0);

  // Premium check
  const premiumDoc = await getPremiumPricingDocIfAny(car.make, car.model);
  const isPremium = !!premiumDoc;

  const ewiAllowedOptions = getOptionsAllowedByEwi(ewi.warrantyCover, ewi.warrantyPeriod);

  if (ewiAllowedOptions.size === 0) {
    throw new ApiError(422, 'This car can not get warranty (invalid EWI warrantyCover/warrantyPeriod).');
  }

  const bucket = determineRuleBucket({ isPremium, ageYears, odometer: odo });

  if (bucket === 'NO_WARRANTY') {
    throw new ApiError(422, 'This car can not get warranty (not eligible by age/odometer rules).');
  }

  const options = buildOptions({
    ewiAllowedOptions,
    bucket,
    ccBand,
    premiumDoc,
  });

  if (options.length === 0) {
    throw new ApiError(422, 'This car can not get warranty (no eligible options after applying rules).');
  }

  return options;
};

module.exports = {
  ApiError,
  normalizeRegNo,
  getWarrantyOptionsForCar,
};