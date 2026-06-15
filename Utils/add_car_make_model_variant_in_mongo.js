// routes/importCarSheetRoute.js
const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const CarMakeModelVariant = require('../Models/carMakeModelVariantModel');

const router = express.Router();

/**
 * Multer config: keep the uploaded file in memory.
 * We don't need to write it to disk; we'll read it directly.
 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10 MB
    },
});

/**
 * Helper to match a column name ignoring case & extra spaces.
 * e.g. "Make" / " MAKE " / "make" will all match "MAKE".
 */
function findColumnKey(headers, targetName) {
    const target = targetName.toLowerCase();
    return (
        headers.find(
            (h) =>
                h &&
                h.toString().trim().toLowerCase() === target
        ) || null
    );
}

/**
 * Convert string to "Title Case":
 *  - everything to lower case
 *  - then capitalize first letter of each word
 *  - words are split by spaces
 */
function toTitleCase(str) {
    return str
        .toLowerCase()
        .split(' ')
        .filter(Boolean) // remove extra spaces
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join(' ');
}

/**
 * POST /api/cars/add-car-make-model-variant
 * Body: multipart/form-data with a file field named "sheet"
 */
router.post(
    '/add-car-make-model-variant',
    upload.single('sheet'),
    async (req, res) => {
        try {
            // 1. Validate file
            if (!req.file) {
                return res
                    .status(400)
                    .json({
                        message:
                            'Sheet file is required (field name: sheet)',
                    });
            }

            // 2. Read workbook from buffer (supports .xlsx, .xls, .csv, etc.)
            const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            // 3. Convert to JSON, using header row as keys
            const rows = XLSX.utils.sheet_to_json(worksheet, {
                defval: '', // use empty string instead of undefined
            });

            if (!rows.length) {
                return res
                    .status(400)
                    .json({ message: 'Sheet is empty' });
            }

            // 4. Determine the actual header keys
            const headers = Object.keys(rows[0]);

            const makeKey = findColumnKey(headers, 'MAKE');
            const modelKey = findColumnKey(headers, 'MODEL');
            const variantKey = findColumnKey(headers, 'VARIANT');

            if (!makeKey || !modelKey || !variantKey) {
                return res.status(400).json({
                    message:
                        'Could not find MAKE / MODEL / VARIANT columns. Check header names in the sheet.',
                    detectedHeaders: headers,
                });
            }

            // 5. Build docs from rows
            const docs = [];

            for (const row of rows) {
                // raw values from sheet
                const rawMake = String(row[makeKey] || '').trim();
                const rawModel = String(row[modelKey] || '').trim();
                const rawVariant = String(row[variantKey] || '').trim();

                // Skip completely empty lines
                if (!rawMake && !rawModel && !rawVariant) continue;

                // normalized/title-cased values
                const make = toTitleCase(rawMake);
                const model = toTitleCase(rawModel);
                const variant = toTitleCase(rawVariant);

                const fullName = [make, model, variant]
                    .filter(Boolean)
                    .join(' ');

                docs.push({
                    fullName,
                    make,
                    model,
                    variant,
                    isActive: true,
                });
            }

            if (!docs.length) {
                return res.status(400).json({
                    message:
                        'No valid rows found (all make/model/variant fields were empty).',
                });
            }

            // 6. Insert into DB
            let insertedCount = 0;

            try {
                const result = await CarMakeModelVariant.insertMany(docs, {
                    ordered: false, // continue inserting even if some documents are duplicates
                });
                insertedCount = result.length;
            } catch (err) {
                // If there are duplicates and we have a unique index,
                // Mongo will throw a BulkWriteError, but some docs will still be inserted.
                if (err.writeErrors || err.result) {
                    insertedCount = err.result?.nInserted || 0;
                    console.warn(
                        'Some documents failed (likely duplicates). Inserted:',
                        insertedCount
                    );
                } else {
                    throw err;
                }
            }

            return res.json({
                message: 'Import completed',
                totalRowsInSheet: rows.length,
                docsPrepared: docs.length,
                docsInserted: insertedCount,
            });
        } catch (error) {
            console.error('Error while importing car sheet:', error);
            return res.status(500).json({
                message: 'Server error while importing car sheet',
                error: error.message,
            });
        }
    }
);

module.exports = router;
