
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const CarModel = require('../../Models/carModel');
const { google } = require('googleapis');
const router = express.Router();
const upload = multer({ dest: 'uploads/' });
const axios = require('axios');
const cloudinary = require('../cloudinary');
const googleDrive = require('../google_drive');
const sharp = require('sharp');
const fileType = require('file-type');

router.post('/import-appsheet-data-to-mongodb', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

        const rowLimit = parseInt(req.query.limit) || null;

        const workbook = XLSX.readFile(req.file.path, { cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        if (rows.length < 2) return res.status(400).json({ message: 'No data found' });

        const dataRows = rowLimit ? rows.slice(1, 1 + rowLimit) : rows.slice(1);

        // Extract schema paths and types (excluding _id, __v)
        const schemaPaths = CarModel.schema.paths;
        const schemaKeys = Object.keys(schemaPaths).filter(k => !['_id', '__v'].includes(k));

        const castValue = (value, type) => {
            if (value === null || value === undefined || value === '') return null;

            switch (type) {
                case 'Date':
                    const date = new Date(value);
                    return isNaN(date.getTime()) ? null : date;
                case 'Number':
                    const num = Number(value);
                    return isNaN(num) ? null : num;
                case 'Array':
                    if (typeof value === 'string') return value.split(',').map(s => s.trim());
                    if (Array.isArray(value)) return value;
                    return [value];
                case 'Boolean':
                    return value.toString().toLowerCase() === 'true';
                default:
                    return value.toString().trim();
            }
        };

        // Map each row
        const mappedData = dataRows.map(row => {
            const mapped = {};
            schemaKeys.forEach((key, i) => {
                const path = schemaPaths[key];
                const fieldType = path.instance; // like 'Date', 'String', 'Array', etc.
                mapped[key] = castValue(row[i], fieldType);
            });
            return mapped;
        });

        fs.unlink(req.file.path, () => { }); // delete uploaded file

        const driveConvertedList = await replaceFilePathsWithDriveUrls(mappedData);

        // ✅ HERE: Convert images from Google Drive URLs to Cloudinary URLs
        const cloudinaryConvertedList = await convertImagesToCloudinary(driveConvertedList);

        // ✅ STORE IN MONGODB
        const finalMongoDBUploadedList = await CarModel.insertMany(cloudinaryConvertedList);
        console.log('Data import completed successfully');


        return res.status(200).json({
            message: 'File processed, typed stored in Mongodb successfully',
            totalRecords: finalMongoDBUploadedList.length,
            data: finalMongoDBUploadedList,
        });
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});


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
/////////////////////////////////////////////////////////////////



// Upload images to cloudinary and convert drive urls to cloudinary urls

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

// Upload image only if not already uploaded
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


// Checks if a field is an array of Google Drive URLs
function isGoogleDriveUrlArray(arr) {
    return Array.isArray(arr) && arr.every(item => typeof item === 'string' && item.includes('drive.google.com'));
}

// Updated Main Conversion Function
async function convertImagesToCloudinary(carList) {
    const updatedCars = [];

    for (const car of carList) {
        const updatedCar = { ...car };
        const appointmentId = car.appointmentId || 'Unknown';
        const baseFolder = `Otobix/Otobix Images/${appointmentId}`;

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
////////////////////////////////////////////////////////////////



module.exports = router;





////////////////////////////// Third function

// const express = require('express');
// const multer = require('multer');
// const XLSX = require('xlsx');
// const mongoose = require('mongoose');
// const camelcase = require('camelcase').default;
// const { google } = require('googleapis');
// const fs = require('fs');
// const path = require('path');
// require('dotenv').config();

// const router = express.Router();
// const upload = multer({ dest: 'uploads/' });

// // Google Drive Setup
// const serviceAccount = JSON.parse(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_KEY);
// const auth = new google.auth.GoogleAuth({
//     credentials: serviceAccount,
//     scopes: ['https://www.googleapis.com/auth/drive.readonly'],
// });
// const drive = google.drive({ version: 'v3', auth });

// // MongoDB Model (replace with your actual schema)
// const CarModel = mongoose.model('Car', new mongoose.Schema({}, { strict: false }));

// // Utils
// const isFileReference = (val) =>
//     typeof val === 'string' && /\.(png|jpg|jpeg|gif|mp4|mov|avi|webp)$/i.test(val);

// // Find file URL in Google Drive
// const findFileInDrive = async (filename) => {
//     const baseName = path.basename(filename.trim());

//     const res = await drive.files.list({
//         q: `name='${baseName}'`,
//         fields: 'files(id, name)',
//         spaces: 'drive',
//     });

//     const file = res.data.files[0];
//     return file ? `https://drive.google.com/uc?id=${file.id}` : null;
// };

// // Main route
// router.post('/import-appsheet-data-to-mongodb', upload.single('file'), async (req, res) => {
//     try {
//         const rowLimit = parseInt(req.query.rowCount) || Infinity;

//         //         const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
//         const workbook = XLSX.readFile(req.file.path, { cellDates: true });
//         const sheetName = workbook.SheetNames[0];
//         const sheetData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

//         const limitedData = sheetData.slice(0, rowLimit);
//         const transformedData = [];

//         for (const row of limitedData) {
//             const newRow = {};

//             for (const key in row) {
//                 const camelKey = camelcase(key.trim());
//                 const value = row[key];

//                 if (typeof value === 'string' && value.match(/\.(png|jpg|jpeg|gif|mp4|mov|avi|webp)/i)) {
//                     // Split by comma in case of multiple files
//                     const parts = value.split(',').map((v) => v.trim()).filter(Boolean);

//                     const urls = await Promise.all(
//                         parts.map(async (filePath) => {
//                             const url = await findFileInDrive(filePath);
//                             return url || filePath; // fallback
//                         })
//                     );

//                     // Join back to string if multiple
//                     // newRow[camelKey] = urls.join(', ');
//                     newRow[camelKey] = urls;
//                 } else {
//                     newRow[camelKey] = value;
//                 }
//             }

//             transformedData.push(newRow);
//         }

//         await CarModel.insertMany(transformedData);
//         fs.unlinkSync(req.file.path); // cleanup

//         res.status(200).json({
//             message: 'Data imported successfully',
//             inserted: transformedData.length,
//         });
//     } catch (err) {
//         console.error(err);
//         res.status(500).json({ error: 'Something went wrong', details: err.message });
//     }
// });

// module.exports = router;







////////////////////////////////////////////////// Second function

// const express = require('express');
// const multer = require('multer');
// const XLSX = require('xlsx');
// const mongoose = require('mongoose');
// const path = require('path');
// const { google } = require('googleapis');

// const router = express.Router();

// // Memory storage
// const upload = multer({ storage: multer.memoryStorage() });

// // Google Auth
// const auth = new google.auth.GoogleAuth({
//     keyFile: path.join(__dirname, 'otobix-service-account-key.json'),
//     scopes: ['https://www.googleapis.com/auth/drive'],
// });
// const drive = google.drive({ version: 'v3', auth });

// // Helpers
// function isMediaFile(value) {
//     const mediaExtensions = [
//         '.png', '.jpg', '.jpeg', '.webp', '.bmp',
//         '.mp4', '.mov', '.avi', '.mkv',
//         '.mp3', '.wav', '.aac', '.ogg',
//         '.pdf'
//     ];
//     return (
//         typeof value === 'string' &&
//         mediaExtensions.some(ext => value.toLowerCase().endsWith(ext))
//     );
// }

// function toCamelCase(str) {
//     return str
//         .replace(/_+|\s+/g, ' ')
//         .replace(/(?:^|\s)([a-z])/g, (_, c) => c.toUpperCase())
//         .replace(/\s+/g, '')
//         .replace(/^([A-Z])/, m => m.toLowerCase());
// }

// async function getFolderIdByName(name) {
//     const res = await drive.files.list({
//         q: `name='${name}' and mimeType='application/vnd.google-apps.folder'`,
//         fields: 'files(id, name)',
//     });
//     return res.data.files[0]?.id || null;
// }

// async function listAllFilesInFolder(folderId) {
//     let files = [];
//     let nextPageToken = null;

//     do {
//         const res = await drive.files.list({
//             q: `'${folderId}' in parents`,
//             fields: 'files(id, name), nextPageToken',
//             pageSize: 1000,
//             pageToken: nextPageToken || undefined,
//         });

//         files = files.concat(res.data.files);
//         nextPageToken = res.data.nextPageToken;
//     } while (nextPageToken);

//     return files;
// }

// async function makePublic(fileId) {
//     await drive.permissions.create({
//         fileId,
//         requestBody: { role: 'reader', type: 'anyone' },
//     });
// }

// // POST route
// router.post('/import-appsheet-data-to-mongodb', upload.single('file'), async (req, res) => {
//     try {
//         const showWarnings = req.body.showWarnings === 'true';

//         if (!req.file || !req.file.buffer) {
//             return res.status(400).json({ error: 'No file uploaded' });
//         }

//         const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
//         const sheetNames = workbook.SheetNames;

//         const folderName = 'Otobix Data';
//         const folderId = await getFolderIdByName(folderName);
//         if (!folderId) {
//             return res.status(404).json({ error: `Google Drive folder "${folderName}" not found.` });
//         }

//         // ✅ Fetch all files once
//         const driveFiles = await listAllFilesInFolder(folderId);
//         const fileMap = new Map();
//         for (const file of driveFiles) {
//             fileMap.set(file.name, file.id);
//         }

//         for (const sheet of sheetNames) {
//             const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]);
//             const processedData = [];

//             for (const row of rawData) {
//                 const newRow = {};

//                 for (const [key, value] of Object.entries(row)) {
//                     const camelKey = toCamelCase(key);

//                     if (typeof value === 'string' && isMediaFile(value)) {
//                         const fileName = path.basename(value);
//                         const fileId = fileMap.get(fileName);

//                         if (fileId) {
//                             await makePublic(fileId);
//                             newRow[camelKey] = `https://drive.google.com/uc?id=${fileId}`;
//                         } else {
//                             if (showWarnings) {
//                                 console.warn(`⚠️ File not found in Drive: ${fileName}`);
//                             }
//                             newRow[camelKey] = value;
//                         }
//                     } else if (!isNaN(value) && typeof value !== 'object') {
//                         newRow[camelKey] = value.toString().includes('.') ? parseFloat(value) : parseInt(value);
//                     } else {
//                         newRow[camelKey] = value;
//                     }
//                 }

//                 processedData.push(newRow);
//             }

//             const collection = mongoose.connection.collection(sheet.toLowerCase());
//             await collection.deleteMany();
//             if (processedData.length > 0) {
//                 await collection.insertMany(processedData);
//                 console.log(`✅ Imported ${processedData.length} records into collection "${sheet.toLowerCase()}"`);
//             } else {
//                 console.log(`⚠️ Skipped "${sheet}" - no valid rows to import.`);
//             }
//         }

//         res.status(200).json({
//             message: '✅ AppSheet Excel data imported and media converted successfully',
//         });
//     } catch (err) {
//         console.error('❌ Import failed:', err);
//         res.status(500).json({ error: 'Import failed' });
//     }
// });

// module.exports = router;





////////////////////////////////////////// First Function

// const express = require('express');
// const multer = require('multer');
// const XLSX = require('xlsx');
// const mongoose = require('mongoose');

// const router = express.Router();

// // Use memory storage to avoid writing to disk
// const upload = multer({ storage: multer.memoryStorage() });

// // POST route to handle Excel import
// router.post('/import-appsheet-data-to-mongodb', upload.single('file'), async (req, res) => {
//     try {
//         if (!req.file || !req.file.buffer) {
//             return res.status(400).json({ error: 'No file uploaded' });
//         }

//         // Read Excel file directly from buffer
//         const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
//         const sheetNames = workbook.SheetNames;

//         for (const sheet of sheetNames) {
//             const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheet]);
//             if (data.length > 0) {
//                 const collection = mongoose.connection.collection(sheet.toLowerCase());
//                 await collection.deleteMany(); // optional: clear old data
//                 await collection.insertMany(data);
//                 console.log(`✅ Imported ${data.length} records into "${sheet}"`);
//             }
//         }

//         res.status(200).json({ message: '✅ AppSheet Excel data imported successfully' });
//     } catch (err) {
//         console.error('❌ Import failed:', err);
//         res.status(500).json({ error: 'Import failed' });
//     }
// });

// module.exports = router;

