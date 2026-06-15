
// customer/sell_my_car_controller.js
// const cloudinary = require('../Config/cloudinary');
// const multer = require('multer');
// const sharp = require('sharp');
const CarMakeModelVariantModel = require('../Models/carMakeModelVariantModel');
const BannersModel = require('../Models/bannersModel');
const { checkAndConsumeApiHitLimit } = require('../Helper Functions/api_hit_limit_helper');
require("dotenv").config();
const axios = require("axios");


const ATTESTR_URL = process.env.ATTESTR_RC_URL || "https://api.attestr.com/api/v2/public/checkx/rc";
const ATTESTR_BASIC_TOKEN = process.env.ATTESTR_BASIC_TOKEN;


// Helper for clean responses
const sendResponse = (res, status, success, message, data = null) => {
    res.status(status).json({ success, message, data });
};

// ======================= Fetch Vehicle Registration Details =======================
exports.fetchVehicleRegistrationDetails = async (req, res) => {
    const { vehicleRegistrationNumber, userId } = req.body;

    if (!vehicleRegistrationNumber) {
        return sendResponse(res, 400, false, "Vehicle registration number is required.");
    }

    if (!ATTESTR_BASIC_TOKEN) {
        return sendResponse(res, 500, false, "Attestr token missing in env.");
    }

    const isAllowed = await checkAndConsumeApiHitLimit({
  userId: userId || '',
  apiName: 'fetchVehicleRegistrationDetails',
  limit: 3, // How many times this api can be hit in a day
});

if (!isAllowed) {
  return sendResponse(res, 400, false, 'Request limit reached. It will reset tomorrow.');
}

    // ✅ Normalize to uppercase (and trim)
    const reg = String(vehicleRegistrationNumber).trim().toUpperCase();

    try {
        const { data } = await axios.post(
            ATTESTR_URL,
            { reg: reg },
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Basic ${ATTESTR_BASIC_TOKEN}`,
                },
                timeout: 20000,
            }
        );

        // data is your exact JSON like: { valid:true, status:"ACTIVE", ... }

        // If invalid reg => return success:false
        if (data?.valid === false) {
            return sendResponse(res, 400, false, "Invalid registration number or no data found.", {
                result: data,
            });
        }

        return sendResponse(res, 200, true, "Vehicle registration details fetched successfully.", {
            result: data,           // ✅ Flutter reads from here
            status: data?.status,   // optional
            valid: data?.valid,     // optional
        });
    } catch (err) {
        console.error("Attestr RC error:", err.response?.data || err.message);

        return sendResponse(
            res,
            err.response?.status || 500,
            false,
            "Failed to fetch vehicle registration details.",
            err.response?.data || err.message
        );
    }
};


/////////////////////////////

// // Perfios credentials from .env
// const BASE_URL = process.env.PERFIOS_RC_AUTHENTICATION_URL;
// const API_KEY = process.env.PERFIOS_RC_AUTHENTICATION_API_KEY;

// // Common headers
// const headers = {
//     "Content-Type": "application/json",
//     "x-auth-key": API_KEY,
// };

// // Helper for clean responses
// const sendResponse = (res, status, success, message, data = null) => {
//     res.status(status).json({ success, message, data });
// };

// // ======================= Fetch Vehicle Registration Details =======================
// exports.fetchVehicleRegistrationDetails = async (req, res) => {
//     const { vehicleRegistrationNumber, userId } = req.body;

//     if (!vehicleRegistrationNumber) {
//         return sendResponse(res, 400, false, "Vehicle registration number is required.");
//     }

//     try {
//         const payload = {
//             "reg_no": vehicleRegistrationNumber,
//             "consent": "y",
//         };

//         // You can safely use userId as caseId
//         if (userId) payload.clientData = { caseId: userId };

//         const { data } = await axios.post(BASE_URL, payload, { headers });


//         sendResponse(
//             res,
//             200,
//             true,
//             "Vehicle registration details fetched successfully.",
//             {
//                 result: data.result,
//                 requestId: data["request_id"],
//                 internalStatusCode: data["status-code"],
//                 caseId: data?.clientData?.caseId || null,
//             }
//         );
//     } catch (err) {
//         console.error("Error fetching vehicle registration details:", err.response?.data || err.message);
//         sendResponse(res, 500, false, "Failed to fetch vehicle registration details.", err.response?.data || err.message);
//     }
// };


// ======================= Fetch banners list according to type =======================
exports.fetchCarBannersList = async (req, res) => {
    try {

        const { view, type, status } = req.body;

        const filter = {};

        if (view) {
            filter.view = view;
        }

        if (type) {
            filter.type = type;
        }

        if (status) {
            filter.status = status;
        }

        const banners = await BannersModel.find(filter).sort({ updatedAt: -1 });



        res.status(200).json({
            success: true,
            data: banners,
        });
    } catch (error) {
        console.error('Error fetching banners:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching banners',
            error: error.message,
        });
    }
};





// // ======================= Search car make-model-variant by fullName =======================
// exports.searchCarMakeModelVariant = async (req, res) => {
//     try {
//         const { q = '', limit = '20' } = req.body;

//         // Parse and cap limit (just in case)
//         let limitNum = parseInt(limit, 10);
//         if (isNaN(limitNum) || limitNum <= 0) limitNum = 20;
//         if (limitNum > 50) limitNum = 50; // safety cap

//         // If nothing is typed, either return top 20, or empty (your choice)
//         // Here: return top 20 active, sorted by fullName
//         const trimmed = q.trim();
//         let filter = { isActive: true };

//         if (trimmed) {
//             // Example: "honda civic" → "honda.*civic" (flexible search)
//             const pattern = trimmed.replace(/\s+/g, '.*');
//             const regex = new RegExp(pattern, 'i');

//             filter.fullName = regex;
//         }

//         const results = await CarMakeModelVariantModel.find(filter)
//             .sort({ fullName: 1 }) // alphabetical
//             .limit(limitNum)
//             .select('fullName'); // only fullName

//         // Return only the strings to make life easy on Flutter
//         const names = results.map((doc) => doc.fullName);

//         return res.status(200).json({
//             success: true,
//             data: names,
//         });
//     } catch (error) {
//         console.error('Error searching car make-model-variant:', error);
//         return res.status(500).json({
//             success: false,
//             message: 'Error searching car make-model-variant',
//             error: error.message,
//         });
//     }
// };





// ======================= 1) Search Makes =======================
exports.searchCarMakes = async (req, res) => {
    try {
        const { q = "", limit = "20" } = req.body;
        const limitNum = parseLimit(limit);

        const makeRegex = buildTypeaheadRegex(q);

        const match = { isActive: true };
        if (makeRegex) match.make = makeRegex;

        const rows = await CarMakeModelVariantModel.aggregate([
            { $match: match },
            { $group: { _id: "$make" } },
            { $sort: { _id: 1 } },
            { $limit: limitNum },
            { $project: { _id: 0, make: "$_id" } },
        ]);

        return res.status(200).json({
            success: true,
            data: rows.map((r) => r.make),
        });
    } catch (error) {
        console.error("Error searching makes:", error);
        return res.status(500).json({
            success: false,
            message: "Error searching makes",
            error: error.message,
        });
    }
};

// ======================= 2) Search Models by Make =======================
exports.searchCarModelsByMake = async (req, res) => {
    try {
        const { make, q = "", limit = "20" } = req.body;

        const makeTrimmed = (make || "").trim();
        if (!makeTrimmed) {
            return res.status(400).json({
                success: false,
                message: "make is required",
            });
        }

        const limitNum = parseLimit(limit);
        const modelRegex = buildTypeaheadRegex(q);

        const match = { isActive: true, make: makeTrimmed };
        if (modelRegex) match.model = modelRegex;

        const rows = await CarMakeModelVariantModel.aggregate([
            { $match: match },
            { $group: { _id: "$model" } },
            { $sort: { _id: 1 } },
            { $limit: limitNum },
            { $project: { _id: 0, model: "$_id" } },
        ]);

        return res.status(200).json({
            success: true,
            data: rows.map((r) => r.model),
        });
    } catch (error) {
        console.error("Error searching models by make:", error);
        return res.status(500).json({
            success: false,
            message: "Error searching models by make",
            error: error.message,
        });
    }
};

// ======================= 3) Search Variants by Make + Model =======================
exports.searchCarVariantsByMakeModel = async (req, res) => {
    try {
        const { make, model, q = "", limit = "20" } = req.body;

        const makeTrimmed = (make || "").trim();
        const modelTrimmed = (model || "").trim();

        if (!makeTrimmed || !modelTrimmed) {
            return res.status(400).json({
                success: false,
                message: "make and model are required",
            });
        }

        const limitNum = parseLimit(limit);
        const variantRegex = buildTypeaheadRegex(q);

        const match = { isActive: true, make: makeTrimmed, model: modelTrimmed };
        if (variantRegex) match.variant = variantRegex;

        const rows = await CarMakeModelVariantModel.aggregate([
            { $match: match },
            { $group: { _id: "$variant" } },
            { $sort: { _id: 1 } },
            { $limit: limitNum },
            { $project: { _id: 0, variant: "$_id" } },
        ]);

        return res.status(200).json({
            success: true,
            data: rows.map((r) => r.variant),
        });
    } catch (error) {
        console.error("Error searching variants by make+model:", error);
        return res.status(500).json({
            success: false,
            message: "Error searching variants by make+model",
            error: error.message,
        });
    }
};



// ======================= Helpers =======================
const parseLimit = (limit, def = 20, max = 50) => {
    let n = parseInt(limit, 10);
    if (isNaN(n) || n <= 0) n = def;
    if (n > max) n = max;
    return n;
};

const escapeRegex = (str = "") => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Creates a regex for typeahead search:
 * - "honda ci" -> /^honda.*ci/i
 * Anchored ^ so it behaves like a proper prefix search (and is faster).
 */
const buildTypeaheadRegex = (q = "") => {
    const trimmed = q.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(/\s+/).map(escapeRegex);
    const pattern = "^" + parts.join(".*");
    return new RegExp(pattern, "i");
};