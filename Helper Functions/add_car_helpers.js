

const cloudinary = require('../Config/cloudinary');
const googleDrive = require('../Config/google_drive');
const { google } = require('googleapis');
const sharp = require('sharp');
const fileType = require('file-type');
require('dotenv').config();
const { DateTime } = require('luxon');
const CarModel = require('../Models/carModel');
const { getAgenda } = require('../Agenda/agenda');
const { scheduleMoveCarFromUpcomingToLive } = require('../Agenda/Agenda Jobs/move_car_from_upcoming_to_live_job');
const CONSTANTS = require('../Utils/constants');
const { addWorkingMinutes, WORKING_HOURS } = require('../Helper Functions/set_working_hours_for_moving_car');
const SocketService = require('../Config/socket_service');
const EVENTS = require('../Sockets/socket_events');
const CarDetailsForCarsListModel = require('../Shared/car_details_for_cars_list_model');


// Function to replace file paths with Drive URLs
async function replaceFilePathsWithDriveUrls(dataArray) {
    const serviceAccountKey = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY);

    const auth = new google.auth.GoogleAuth({
        credentials: serviceAccountKey,
        scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });

    const drive = google.drive({ version: 'v3', auth });

    const fileCache = {}; // To avoid redundant API calls

    // Helper to get fileId by file name (only if path contains '/')
    async function getFileIdByName(fileName) {
        if (fileCache[fileName]) return fileCache[fileName];

        try {
            const response = await drive.files.list({
                q: `name='${fileName.replace(/'/g, "\\'")}' and trashed = false`,
                fields: 'files(id, name)',
                pageSize: 1,
            });

            const file = response.data.files?.[0];
            const fileId = file?.id || null;
            fileCache[fileName] = fileId;
            return fileId;
        } catch (err) {
            console.error(`❌ Error fetching ${fileName} from Drive:`, err.message);
            fileCache[fileName] = null;
            return null;
        }
    }

    const updatedData = [];

    for (const row of dataArray) {
        const updatedRow = { ...row };

        for (const key in updatedRow) {
            const val = updatedRow[key];

            // Handle string path
            if (typeof val === 'string' && val.includes('/')) {
                const fileName = val.split('/').pop();
                const fileId = await getFileIdByName(fileName);
                if (fileId) {
                    updatedRow[key] = `https://drive.google.com/uc?id=${fileId}`;
                }
            }

            // Handle array of paths
            else if (Array.isArray(val)) {
                const newArray = [];

                for (const item of val) {
                    if (typeof item === 'string' && item.includes('/')) {
                        const fileName = item.split('/').pop();
                        const fileId = await getFileIdByName(fileName);
                        newArray.push(fileId ? `https://drive.google.com/uc?id=${fileId}` : item);
                    } else {
                        newArray.push(item);
                    }
                }

                updatedRow[key] = newArray;
            }
        }

        updatedData.push(updatedRow);
    }

    return updatedData;
}




// Upload images to cloudinary and convert drive urls to cloudinary urls
async function convertImagesToCloudinary(carList) {
    const updatedCars = [];

    for (const car of carList) {
        const updatedCar = { ...car };
        const appointmentId = car.appointmentId || 'Unknown';
        const baseFolder = `${process.env.CLOUDINARY_PARENT_FOLDER}/Car Images/${appointmentId}`;

        for (const key in updatedCar) {
            const fieldValue = updatedCar[key];

            if (isGoogleDriveUrlArray(fieldValue)) {
                const cloudinaryUrls = [];

                for (const gdriveUrl of fieldValue) {
                    try {
                        const { buffer: fileBuffer, fileId } = await downloadFromDrive(gdriveUrl);

                        if (!(await isImage(fileBuffer))) {
                            console.log(`Skipped non-image file: ${gdriveUrl}`);
                            cloudinaryUrls.push(gdriveUrl);
                            continue;
                        }

                        const compressedBuffer = await compressImage(fileBuffer);

                        const cloudinaryUrl = await uploadImageWithCheck(compressedBuffer, baseFolder, fileId);
                        cloudinaryUrls.push(cloudinaryUrl);

                    } catch (error) {
                        console.error(`Error processing ${gdriveUrl}:`, error);
                        cloudinaryUrls.push(gdriveUrl);
                    }
                }

                updatedCar[key] = cloudinaryUrls;

            } else if (typeof fieldValue === 'string' && fieldValue.includes('drive.google.com')) {
                try {
                    const { buffer: fileBuffer, fileId } = await downloadFromDrive(fieldValue);

                    if (!(await isImage(fileBuffer))) {
                        console.log(`Skipped non-image file: ${fieldValue}`);
                        updatedCar[key] = fieldValue;
                        continue;
                    }

                    const sizeMB = fileBuffer.byteLength / (1024 * 1024);
                    const compressedBuffer = sizeMB > 10
                        ? await compressImage(fileBuffer, 5)
                        : await sharp(fileBuffer).jpeg({ quality: 75 }).toBuffer();

                    const cloudinaryUrl = await uploadImageWithCheck(compressedBuffer, baseFolder, fileId);
                    updatedCar[key] = cloudinaryUrl;

                } catch (error) {
                    console.error(`Error processing ${fieldValue}:`, error);
                    updatedCar[key] = fieldValue;
                }
            }
        }

        updatedCars.push(updatedCar);
    }

    return updatedCars;
}


// Set car fields according to car model
function setCarFieldsAccordingToCarModel(Model, rows, opts = {}) {
    const {
        dateZone = 'Asia/Kolkata',
        trimStrings = true,
    } = opts;

    if (!Array.isArray(rows)) return [];

    // Build a quick map of schema field -> type info
    const schema = Model.schema;
    const fields = Object.keys(schema.paths).reduce((acc, key) => {
        // ignore __v and _id
        if (key === '__v' || key === '_id') return acc;

        const path = schema.paths[key];
        const instance = path.instance; // "String" | "Number" | "Date" | "Array" | ...
        // For arrays, check caster type: e.g. [String]
        const caster = path.caster ? path.caster.instance : null;

        acc[key] = { instance, caster };
        return acc;
    }, {});

    // Utilities
    const toStringSafe = (v) => {
        if (v == null) return undefined;
        let s = String(v);
        if (trimStrings) s = s.trim();
        return s;
    };

    // const toNumber = (v) => {
    //     if (v === '' || v == null) return undefined;
    //     const n = Number(v);
    //     return Number.isFinite(n) ? n : undefined;
    // };

    const toNumber = (v) => {
        if (v == null) return undefined;

        if (typeof v === 'number') {
            return Number.isFinite(v) ? v : undefined;
        }

        // Normalize string
        let s = toStringSafe(v);           // trims whitespace
        if (!s) return undefined;          // catches "" and "    " so we DON'T turn them into 0

        // Remove currency symbols, commas, spaces (incl. NBSP)
        s = s.replace(/[₹$, \u00A0]/g, '');
        // Handle Indian-style thousands "4,50,000" (commas already removed)
        // Handle European "1.234,56" -> "1234.56"
        const european = /^\d{1,3}(\.\d{3})*,\d+$/;
        if (european.test(s)) s = s.replace(/\./g, '').replace(',', '.');

        const n = Number(s);
        return Number.isFinite(n) ? n : undefined;
    };


    const toArrayOfStrings = (v) => {
        if (Array.isArray(v)) {
            const out = v
                .map(toStringSafe)
                .filter((x) => x !== undefined && x !== '');
            return out.length ? out : undefined;
        }
        // allow comma-separated strings
        const s = toStringSafe(v);
        if (!s) return undefined;
        const parts = s
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean);
        return parts.length ? parts : undefined;
    };


    // New
    const toUtcDate = (v, dateZone = 'Asia/Kolkata') => {
        if (v == null || v === '') return undefined;

        // 1) If number: treat as timestamp (ms or seconds)
        if (typeof v === 'number') {
            const asMs = v > 1e12 ? v : v * 1000;
            const dt = DateTime.fromMillis(asMs, { zone: dateZone });
            return dt.isValid ? dt.toUTC().toJSDate() : undefined;
        }

        // 2) If already a JS Date
        if (v instanceof Date && !isNaN(v.getTime())) {
            const dt = DateTime.fromJSDate(v, { zone: dateZone });
            return dt.isValid ? dt.toUTC().toJSDate() : undefined;
        }

        // 3) String from AppSheet (always M/d/yyyy or M/d/yyyy HH:mm:ss)
        const s = String(v).trim();
        if (!s) return undefined;

        let dt;

        // a) MM/dd/yyyy with time, e.g. "1/2/2015 13:45:00"
        dt = DateTime.fromFormat(s, 'M/d/yyyy HH:mm:ss', { zone: dateZone });

        // b) MM/dd/yyyy date only, e.g. "1/2/2015"
        if (!dt.isValid) {
            dt = DateTime.fromFormat(s, 'M/d/yyyy', { zone: dateZone });
        }

        // c) Extra format: 8-Jan-2025
        if (!dt.isValid) {
            dt = DateTime.fromFormat(s, 'd-MMM-yyyy', { zone: dateZone });
            // If you sometimes get "08-Jan-2025", 'd-MMM-yyyy' still works.
        }

        // d) Extra format: 2025-01-08 04:17:02 (yyyy-MM-dd HH:mm:ss)
        if (!dt.isValid) {
            dt = DateTime.fromFormat(s, 'yyyy-MM-dd HH:mm:ss', { zone: dateZone });
        }

        // e) Optional: ISO, e.g. "2025-01-08T04:17:02"
        if (!dt.isValid) {
            dt = DateTime.fromISO(s, { zone: dateZone });
        }

        // f) If still invalid: give up (do NOT let JS guess with new Date())
        if (!dt.isValid) {
            console.warn(`⚠️ Could not parse date string as M/d/yyyy: "${s}"`);
            return undefined;
        }

        // Convert to UTC JS Date for Mongo
        return dt.toUTC().toJSDate();
    };


    // // Old
    // const toUtcDate = (v) => {
    //     if (v == null || v === '') return undefined;

    //     const tryParse = (str) => {
    //         let dt =
    //             // ISO first
    //             DateTime.fromISO(str, { zone: dateZone });

    //         if (!dt.isValid)
    //             dt = DateTime.fromSQL(str, { zone: dateZone });               // "yyyy-MM-dd HH:mm:ss"

    //         if (!dt.isValid)
    //             dt = DateTime.fromFormat(str, 'd/M/yyyy HH:mm:ss', { zone: dateZone }); // "1/7/2025 11:36:00"
    //         if (!dt.isValid)
    //             dt = DateTime.fromFormat(str, 'M/d/yyyy HH:mm:ss', { zone: dateZone }); // US fallback

    //         if (!dt.isValid)
    //             dt = DateTime.fromFormat(str, 'dd/MM/yyyy', { zone: dateZone });
    //         if (!dt.isValid)
    //             dt = DateTime.fromFormat(str, 'd/M/yyyy', { zone: dateZone });
    //         if (!dt.isValid)
    //             dt = DateTime.fromFormat(str, 'yyyy-MM-dd', { zone: dateZone });

    //         if (!dt.isValid) {
    //             const d = new Date(str); // last resort
    //             if (!isNaN(d.getTime())) {
    //                 dt = DateTime.fromJSDate(d, { zone: dateZone });
    //             }
    //         }
    //         return dt.isValid ? dt.toUTC().toJSDate() : undefined;
    //     };

    //     if (typeof v === 'number') {
    //         const asMs = v > 1e12 ? v : v * 1000;
    //         const dt = DateTime.fromMillis(asMs, { zone: dateZone });
    //         return dt.isValid ? dt.toUTC().toJSDate() : undefined;
    //     }

    //     if (v instanceof Date && !isNaN(v.getTime())) {
    //         const dt = DateTime.fromJSDate(v, { zone: dateZone });
    //         return dt.isValid ? dt.toUTC().toJSDate() : undefined;
    //     }

    //     const s = toStringSafe(v);
    //     if (!s) return undefined;
    //     return tryParse(s);
    // };


    // Main coercion
    return rows.map((row) => {
        const out = {};
        for (const key of Object.keys(fields)) {
            const { instance, caster } = fields[key];
            const val = row[key];

            if (val == null) {
                // Leave undefined so Mongoose defaults can apply
                continue;
            }

            if (instance === 'String') {
                const s = toStringSafe(val);
                if (s !== undefined) out[key] = s;
            } else if (instance === 'Number') {
                const n = toNumber(val);
                if (n !== undefined) out[key] = n;
            } else if (instance === 'Date') {
                const d = toUtcDate(val);
                if (d !== undefined) out[key] = d;
            } else if (instance === 'Array' && caster === 'String') {
                const arr = toArrayOfStrings(val);
                if (arr !== undefined) out[key] = arr;
            } else {
                // Fallback: keep as-is (for uncommon types)
                out[key] = val;
            }
        }
        return out;
    });
}



// Schedule Agenda jobs for upcoming cars
async function scheduleJobsForUpcomingCars(cars) {
    if (!Array.isArray(cars) || cars.length === 0) return [];

    const agenda = getAgenda();
    const forceSeconds = process.env.FORCE_SECONDS ? Number(process.env.FORCE_SECONDS) : null;

    const results = [];

    for (const car of cars) {
        try {
            const carId = car._id?.toString?.() || String(car._id);

            // ── 1) Read normalized fields from the (already saved) document
            // Your normalizeAuctionFields ensured these are coherent:
            // upcomingUntil === auctionStartTime (for 'upcoming')
            const start = car.auctionStartTime ? new Date(car.auctionStartTime) : null;
            const until = car.upcomingUntil ? new Date(car.upcomingUntil) : start;

            if (!until) {
                results.push({ carId, error: 'Missing upcomingUntil/auctionStartTime on car' });
                continue;
            }

            // ── 2) Optional override ONLY for scheduling speedups in dev
            const scheduleAt = forceSeconds != null
                ? new Date(Date.now() + forceSeconds * 1000) // don't save this to DB
                : until;

            // ── 3) De-dupe any old jobs
            await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_UPCOMING_TO_LIVE, 'data.carId': carId });
            await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.START_LIVE_AUCTION, 'data.carId': carId });
            await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.END_LIVE_AUCTION, 'data.carId': carId });

            // ── 4) Schedule UPCOMING → LIVE at the computed time
            await scheduleMoveCarFromUpcomingToLive(agenda, carId, scheduleAt);

            results.push({
                carId,
                scheduledToRunAt: scheduleAt,
                inUpcomingFor: until, // the normalized time from the doc
                override: forceSeconds != null ? `FORCE_SECONDS=${forceSeconds}s` : null,
            });
        } catch (err) {
            results.push({
                carId: car?._id?.toString?.() || String(car?._id || ''),
                error: err?.message || String(err),
            });
        }
    }

    return results;
}



// //  Normalize auction fields
// function normalizeAuctionFields(cars) {
//     if (!Array.isArray(cars)) return cars;

//     const now = new Date();

//     return cars.map(car => {
//         const updated = { ...car };

//         // Default values
//         const status = updated.auctionStatus || 'upcoming';
//         const durationHrs = Number.isFinite(updated.auctionDuration) ? updated.auctionDuration : 24;
//         const minutes = Number.isFinite(updated.upcomingTime) ? updated.upcomingTime : 10;

//         if (status === 'upcoming') {
//             // if no start given, compute start = now + upcomingTime minutes (respect working hours)
//             const start = updated.auctionStartTime
//                 ? new Date(updated.auctionStartTime)
//                 : addWorkingMinutes(now, minutes, WORKING_HOURS);

//             updated.auctionStartTime = start;
//             updated.upcomingUntil = start;
//             updated.auctionDuration = durationHrs;
//             updated.auctionEndTime = new Date(start.getTime() + durationHrs * 60 * 60 * 1000);
//         } else if (status === 'live') {
//             // for live auctions, make sure end is derived from start+duration if possible
//             if (updated.auctionStartTime) {
//                 updated.auctionDuration = durationHrs;
//                 updated.auctionEndTime = new Date(new Date(updated.auctionStartTime).getTime() + durationHrs * 60 * 60 * 1000);
//             }
//         }

//         // highestBid & others
//         if (updated.highestBid == null) updated.highestBid = 0;
//         if (updated.highestBidder == null) updated.highestBidder = '';

//         return updated;
//     });
// }


// Helper to set (auctionStartTime, upcomingUntil, liveAt, auctionEndTime) 
function setAuctionTimes(cars, opts = {}) {
    if (!Array.isArray(cars)) return [];

    const {
        now = new Date(),
        upcomingMinutesDefault = 10,
        durationHoursDefault = 24,
    } = opts;

    const currentDateAndTime = (now instanceof Date) ? now : new Date(now);

    return cars.map((car) => {
        // Business-hours aware start computed ONLY from opts
        const start = addWorkingMinutes(currentDateAndTime, upcomingMinutesDefault, WORKING_HOURS);
        const end = new Date(start.getTime() + durationHoursDefault * 60 * 60 * 1000);

        return {
            ...car,
            auctionStartTime: start,
            upcomingUntil: start,
            liveAt: start,
            auctionEndTime: end,
        };
    });
}









///////////////////////////// Current file helpers ////////////////////////////////////

// Helper: Download file from Google Drive
async function downloadFromDrive(url) {
    const fileIdMatch = url.match(/id=([^&]+)/);
    if (!fileIdMatch) throw new Error('Invalid Google Drive URL');
    const fileId = fileIdMatch[1];
    const res = await googleDrive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
    );
    return { buffer: Buffer.from(res.data, 'binary'), fileId };
}

// Helper: Check if buffer is an image
async function isImage(buffer) {
    const type = await fileType.fileTypeFromBuffer(buffer);
    return type && type.mime.startsWith('image/');
}


// Helper: Compress image 
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
                // console.log(`✅ Compressed to ${(compressedBuffer.byteLength / 1024).toFixed(1)} KB at ${width}px width & quality ${currentQuality}`);
                return compressedBuffer;
            }

            currentQuality -= 10;
        }

        width -= 100;
    }

    console.warn(`⚠️ Could not compress below 100 KB. Final size: ${(compressedBuffer?.byteLength / 1024).toFixed(1)} KB`);
    return compressedBuffer;
}


// Helper: Check if image is already uploaded
async function checkIfAlreadyUploaded(publicId) {
    try {
        const result = await cloudinary.api.resource(publicId, {
            resource_type: 'image',
        });
        return result.secure_url;
    } catch (error) {
        if (error.http_code === 404) {
            return null; // Expected behavior if file not uploaded
        } else {
            // console.error(`Cloudinary API error for ${publicId}:`, error);
            console.log(`Not Already uploaded: ${publicId}`);
            return null;
        }
    }
}

// Helper: Upload image only if not already uploaded
async function uploadImageWithCheck(buffer, folder, fileId) {
    const publicId = `${folder}/${fileId}`;
    const existingUrl = await checkIfAlreadyUploaded(publicId);
    if (existingUrl) {
        console.log(`Already uploaded: ${publicId}`);
        return existingUrl;
    }

    const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, public_id: fileId },
            (error, result) => (error ? reject(error) : resolve(result))
        );
        stream.end(buffer);
    });

    return uploadResult.secure_url;
}


// Helper: Checks if a field is an array of Google Drive URLs
function isGoogleDriveUrlArray(arr) {
    return Array.isArray(arr) && arr.every(item => typeof item === 'string' && item.includes('drive.google.com'));
}

///////////////////////////// Current file helpers ////////////////////////////////////


module.exports = {
    setCarFieldsAccordingToCarModel,
    convertImagesToCloudinary,
    replaceFilePathsWithDriveUrls,
    scheduleJobsForUpcomingCars,
    // normalizeAuctionFields,
    setAuctionTimes
};






