// Extra Files/dummy.js

// const NotificationsModel = require('../Models/userNotificationsModel'); // Adjust path if needed

// exports.dummyFunctionForNow = async function (req, res) {
//     const { deletedCount } = await NotificationsModel.deleteMany({
//         title: 'Test Notification',
//     });
//     return deletedCount; // number of docs removed
// }


// // For Fixing dates issue
// const express = require('express');
// const multer = require('multer');
// const xlsx = require('xlsx');
// const { DateTime } = require('luxon');
// const CarModel = require('../Models/carModel'); // ✅ adjust path

// const router = express.Router();
// const upload = multer({ storage: multer.memoryStorage() });

// // Interpret sheet values in this timezone (then convert to UTC for Mongo)
// const DATE_ZONE = 'Asia/Kolkata';

// // Column header in sheet
// const APPOINTMENT_ID_COLUMN = 'Appointment ID';

// // ✅ Only these fields will ever be updated
// const DATE_ONLY_FIELDS = [
//     { field: 'timestamp', sheet: 'Timestamp' },
//     { field: 'registrationDate', sheet: 'Registration Date' },
//     { field: 'fitnessTill', sheet: 'Fitness Till ' },
//     { field: 'yearMonthOfManufacture', sheet: 'Year Month of Manufacture' },
//     { field: 'taxValidTill', sheet: 'Tax Valid Till' },
//     { field: 'insuranceValidity', sheet: 'Insurance Validity' },
//     { field: 'approvalDate', sheet: 'Approval Date' },
//     { field: 'newArrivalMessage', sheet: 'New Arrival Message' },
//     { field: 'sendToAuctionApk', sheet: 'Send to Auction APK' },
// ];

// // approvalTime = Approval Date + Approval Time
// const APPROVAL_DATE_COL = 'Approval Date';
// const APPROVAL_TIME_COL = 'Approval Time';

// // ---------- Helpers ----------
// function isEmpty(v) {
//     return v === null || v === undefined || String(v).trim() === '';
// }

// function toExcelDateFromSerial(serial) {
//     // Excel serial: days since 1899-12-30 (common XLSX convention)
//     const excelEpoch = DateTime.fromISO('1899-12-30', { zone: DATE_ZONE });
//     return excelEpoch.plus({ days: Number(serial) });
// }

// // Parse sheet date where input might be:
// // - JS Date
// // - Excel serial number
// // - string like "M/d/yyyy" OR "M/d/yyyy HH:mm" etc
// function parseSheetDateTime(raw, ctx = '') {
//     if (isEmpty(raw)) return null;

// // JS Date from XLSX
//     if (raw instanceof Date && !isNaN(raw.getTime())) {
//         const dt = DateTime.fromJSDate(raw, { zone: DATE_ZONE });
//         if (!dt.isValid) {
//             console.error(`❌ Invalid JS Date for ${ctx}`, raw);
//             return null;
//         }
//         return dt;
//     }

//     // Excel serial number
//     if (typeof raw === 'number' && !Number.isNaN(raw)) {
//         const dt = toExcelDateFromSerial(raw);
//         if (!dt.isValid) {
//             console.error(`❌ Invalid Excel serial for ${ctx}`, raw);
//             return null;
//         }
//         return dt;
//     }

//     // Strings
//     const s = String(raw).trim();
//     if (!s) return null;

//     // Try multiple formats (month/day/year always)
//     const formats = [
//         'M/d/yyyy',
//         'M/d/yyyy H:mm',
//         'M/d/yyyy HH:mm',
//         'M/d/yyyy H:mm:ss',
//         'M/d/yyyy HH:mm:ss',
//         'M/d/yyyy h:mm a',
//         'M/d/yyyy h:mm:ss a',
//     ];

//     for (const fmt of formats) {
//         const dt = DateTime.fromFormat(s, fmt, { zone: DATE_ZONE });
//         if (dt.isValid) return dt;
//     }

//     // As a last resort try ISO
//     const isoTry = DateTime.fromISO(s, { zone: DATE_ZONE });
//     if (isoTry.isValid) return isoTry;

//     console.error(`❌ Could not parse date "${s}" for ${ctx}`);
//     return null;
// }

// // For date-only fields, force midnight (local zone) then store UTC Date in Mongo
// function parseDateOnly(raw, ctx = '') {
//     const dt = parseSheetDateTime(raw, ctx);
//     if (!dt) return null;
//     return dt.startOf('day').toUTC().toJSDate();
// }

// // For approvalTime: combine date + time columns (time required if either present)
// // If date cell already contains a time AND time column is empty, we keep the date cell time.
// function parseApprovalTime(rawDate, rawTime, ctx = '') {
//     if (isEmpty(rawDate) && isEmpty(rawTime)) return null;

//     const dateDt = parseSheetDateTime(rawDate, `${ctx} (date)`);
//     if (!dateDt) return null;

//     // If time column empty, and date already has time component, accept it
//     if (isEmpty(rawTime)) {
//         // If sheet date is date-only, this becomes midnight; still acceptable.
//         return dateDt.toUTC().toJSDate();
//     }

//     const timeStr = String(rawTime).trim();
//     const timeFormats = ['H:mm', 'HH:mm', 'H:mm:ss', 'HH:mm:ss', 'h:mm a', 'h:mm:ss a'];

//     let t = null;
//     for (const fmt of timeFormats) {
//         const dt = DateTime.fromFormat(timeStr, fmt, { zone: DATE_ZONE });
//         if (dt.isValid) {
//             t = dt;
//             break;
//         }
//     }
//     if (!t) {
//         console.error(`❌ Could not parse time "${timeStr}" for ${ctx}`);
//         return null;
//     }

//     const combined = dateDt.set({
//         hour: t.hour,
//         minute: t.minute,
//         second: t.second,
//         millisecond: 0,
//     });

//     if (!combined.isValid) {
//         console.error(`❌ Combined approvalTime invalid for ${ctx}`);
//         return null;
//     }

//     return combined.toUTC().toJSDate();
// }

// // Compare JS Dates safely
// function sameDate(a, b) {
//     if (!a && !b) return true;
//     if (!a || !b) return false;
//     const ta = a instanceof Date ? a.getTime() : new Date(a).getTime();
//     const tb = b instanceof Date ? b.getTime() : new Date(b).getTime();
//     return ta === tb;
// }

// // ---------- Route ----------
// /**
//  * POST /admin/fix-car-dates
//  * form-data: file = xlsx
//  */
// router.post('/fix-car-dates', upload.single('file'), async (req, res) => {
//     const startedAt = Date.now();

//     try {
//         if (!req.file) {
//             return res.status(400).json({ error: 'No file uploaded. Use form-data key "file".' });
//         }

//         const workbook = xlsx.read(req.file.buffer, {
//             type: 'buffer',
//             cellDates: true,
//         });

//         const sheetName = workbook.SheetNames[0];
//         const sheet = workbook.Sheets[sheetName];

//         const rows = xlsx.utils.sheet_to_json(sheet, {
//             defval: '',
//             raw: false,
//             // NOTE: we rely on our Luxon parsing (month/day/year)
//         });

//         console.log(`✅ Loaded ${rows.length} rows from "${sheetName}"`);

//         // Build map: appointmentId -> row
//         const rowByAppointmentId = new Map();
//         for (const row of rows) {
//             const rawId =
//                 row[APPOINTMENT_ID_COLUMN] ??
//                 row['appointmentId'] ??
//                 row['AppointmentID'] ??
//                 row['Appointment Id'];

//             if (isEmpty(rawId)) continue;

//             const id = String(rawId).trim();
//             if (!id) continue;

//             rowByAppointmentId.set(id, row); // last wins
//         }

//         const sheetIds = Array.from(rowByAppointmentId.keys());
//         if (!sheetIds.length) {
//             return res.status(400).json({
//                 message: 'No appointment IDs found in sheet. Nothing to do.',
//                 summary: { totalRows: rows.length, updated: 0, unchanged: 0, skippedNoCar: 0, errors: 0 },
//             });
//         }

//         // Fetch only what we need (fast)
//         const selectFields = [
//             '_id',
//             'appointmentId',
//             ...DATE_ONLY_FIELDS.map(x => x.field),
//             'approvalTime',
//         ].join(' ');

//         const cars = await CarModel.find({ appointmentId: { $in: sheetIds } })
//             .select(selectFields)
//             .lean();

//         const carByAppointmentId = new Map();
//         for (const car of cars) {
//             const id = String(car.appointmentId || '').trim();
//             if (id) carByAppointmentId.set(id, car);
//         }

//         const summary = {
//             totalRows: rows.length,
//             uniqueAppointmentIdsInSheet: sheetIds.length,
//             carsMatchedInDb: cars.length,

//             updatedAppointmentIds: [],
//             unchangedAppointmentIds: [],
//             skippedSheetIdsNoCarInDb: [],
//             errors: [], // { appointmentId, field, reason, rawValue }

//             bulkOps: 0,
//             modifiedCount: 0,
//             matchedCount: 0,

//             tookMs: 0,
//         };

//         const bulkOps = [];

//         // Iterate sheet IDs (so "if no car => skip")
//         for (const appointmentId of sheetIds) {
//             const row = rowByAppointmentId.get(appointmentId);
//             const car = carByAppointmentId.get(appointmentId);

//             if (!car) {
//                 summary.skippedSheetIdsNoCarInDb.push(appointmentId);
//                 continue;
//             }

//             const updates = {};

//             // date-only fields
//             for (const { field, sheet: col } of DATE_ONLY_FIELDS) {
//                 const raw = row[col];

//                 // If empty in sheet -> do NOT change
//                 if (isEmpty(raw)) continue;

//                 const parsed = parseDateOnly(raw, `appointmentId=${appointmentId}, field=${field}`);
//                 if (!parsed) {
//                     summary.errors.push({
//                         appointmentId,
//                         field,
//                         reason: `Failed to parse date-only from column "${col}"`,
//                         rawValue: raw,
//                     });
//                     continue;
//                 }

//                 // Only update if changed
//                 if (!sameDate(car[field], parsed)) {
//                     updates[field] = parsed;
//                 }
//             }

//             // approvalTime (date+time)
//             const rawApprovalDate = row[APPROVAL_DATE_COL];
//             const rawApprovalTime = row[APPROVAL_TIME_COL];

//             // Only attempt if either has something
//             if (!isEmpty(rawApprovalDate) || !isEmpty(rawApprovalTime)) {
//                 const combined = parseApprovalTime(
//                     rawApprovalDate,
//                     rawApprovalTime,
//                     `appointmentId=${appointmentId}, field=approvalTime`
//                 );

//                 if (combined) {
//                     if (!sameDate(car.approvalTime, combined)) {
//                         updates.approvalTime = combined;
//                     }
//                 } else {
//                     summary.errors.push({
//                         appointmentId,
//                         field: 'approvalTime',
//                         reason: `Failed to combine "${APPROVAL_DATE_COL}" + "${APPROVAL_TIME_COL}"`,
//                         rawValue: { rawApprovalDate, rawApprovalTime },
//                     });
//                 }
//             }

//             if (Object.keys(updates).length > 0) {
//                 bulkOps.push({
//                     updateOne: {
//                         filter: { _id: car._id },
//                         update: { $set: updates },
//                     },
//                 });
//                 summary.updatedAppointmentIds.push(appointmentId);
//             } else {
//                 summary.unchangedAppointmentIds.push(appointmentId);
//             }
//         }

//         summary.bulkOps = bulkOps.length;

//         if (!bulkOps.length) {
//             summary.tookMs = Date.now() - startedAt;
//             console.log('ℹ️ No changes detected. Nothing updated.');
//             console.log('Summary:', summary);
//             return res.json({
//                 message: 'No date fields needed updating (all matched docs already correct).',
//                 summary,
//             });
//         }

//         console.log(`🚀 Running bulkWrite (${bulkOps.length} ops) ordered:false ...`);
//         const bulkResult = await CarModel.bulkWrite(bulkOps, { ordered: false });

//         summary.matchedCount = bulkResult.matchedCount ?? bulkResult.nMatched ?? 0;
//         summary.modifiedCount = bulkResult.modifiedCount ?? bulkResult.nModified ?? 0;
//         summary.tookMs = Date.now() - startedAt;

//         console.log('✅ bulkWrite done:', {
//             matchedCount: summary.matchedCount,
//             modifiedCount: summary.modifiedCount,
//             tookMs: summary.tookMs,
//             updated: summary.updatedAppointmentIds.length,
//             unchanged: summary.unchangedAppointmentIds.length,
//             skippedNoCar: summary.skippedSheetIdsNoCarInDb.length,
//             errors: summary.errors.length,
//         });

//         return res.json({
//             message: 'Date fix completed. Only specified date fields were updated where needed.',
//             summary: {
//                 ...summary,
//                 bulkResult,
//             },
//         });
//     } catch (err) {
//         console.error('🔥 Error in /fix-car-dates:', err);
//         return res.status(500).json({
//             error: 'Internal server error',
//             details: err.message,
//         });
//     }
// });

// module.exports = router;
