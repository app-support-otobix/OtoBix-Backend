
// Inspection/inspection_controller.js
require("dotenv").config();
const axios = require("axios");
const mongoose = require("mongoose");

const UserModel = require("../Models/userModel");
const CONSTANTS = require("../Utils/constants");
const { checkAndConsumeApiHitLimit } = require('../Helper Functions/api_hit_limit_helper');
const { extractMakeModelVariantUsingAI } = require("../Helper Functions/extract_make_model_variant_using_ai_helper");


const ATTESTR_URL = process.env.ATTESTR_RC_URL || "https://api.attestr.com/api/v2/public/checkx/rc";
const ATTESTR_BASIC_TOKEN = process.env.ATTESTR_BASIC_TOKEN;


// Helper for clean responses
const sendResponse = (res, status, success, message, data = null) => {
    res.status(status).json({ success, message, data });
};

// ======================= Fetch Vehicle Details Via Attestr & AI =======================
exports.fetchVehicleDetailsViaAttestr = async (req, res) => {
    try {
    const { userId, registrationNumber } = req.body;
    
    if (!ATTESTR_BASIC_TOKEN) {
        return sendResponse(res, 500, false, "Attestr token missing in env.");
    }

    if (!userId || !registrationNumber) {
        return sendResponse(res, 400, false, "User ID & Registration Number are required.");
    }

    // If user is Inspection Engineer then limit is 10
    let isInspectionEngineer = false;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        const user = await UserModel.findById(userId).select("userRole").lean();
        if (user) { isInspectionEngineer = user.userRole === CONSTANTS.USER_ROLES.INSPECTION_ENGINEER; }
    } else { console.warn("Invalid userId provided, skipping DB lookup:", userId); }

    // const user = await UserModel.findById(userId).select("userRole").lean();
    // if (!user) {   return sendResponse(res, 404, false, "User not found.");  }
    // const isInspectionEngineer = user.userRole === CONSTANTS.USER_ROLES.INSPECTION_ENGINEER;

    const isAllowed = await checkAndConsumeApiHitLimit({
    userId: userId || '',
    apiName: 'fetchVehicleDetailsViaAttestr', // API Name
    limit: isInspectionEngineer ? 10 : 3, // How many times this api can be hit in a day
    });
    if (!isAllowed) { return sendResponse(res, 400, false, 'Request limit reached. It will reset tomorrow.'); }


    // ✅ Normalize to uppercase (and trim)
    const reg = String(registrationNumber).trim().toUpperCase();
    
    // Hit third-party API
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
        if (!data || data.valid === false) {
            return sendResponse(res, 400, false, "Invalid Registration Number or No data found.", {
                result: data || null,
            });
        }

        // Extract make / model / variant using AI
    const makerDescription = data?.makerDescription || "";
    const makerModel = data?.makerModel || "";

    let aiParsedData = { make: "", model: "", variant: "", };
     if (makerDescription || makerModel) {
      try {
        const aiResponse = await extractMakeModelVariantUsingAI({
          makerDescription,
          makerModel,
        });

        aiParsedData = {
          make: aiResponse?.make || "",
          model: aiResponse?.model || "",
          variant: aiResponse?.variant || "",
        };
      } catch (aiError) {
        console.error(
          "AI make/model/variant extraction error:",
          aiError.message || aiError
        );
      }
    }
    // Merge third-party response with AI parsed fields
    const finalResult = {
      ...data,
      make: aiParsedData.make,
      model: aiParsedData.model,
      variant: aiParsedData.variant,
    };

        return sendResponse(res, 200, true, "Vehicle registration details fetched successfully.", {
            result: finalResult,
        status: data?.status || "",
        valid: data?.valid || false,
        });

    } catch (err) {
        console.error("Attestr RC error:", err.response?.data || err.message);
        return sendResponse(
            res,
            err.response?.status || 500,
            false,
            err.message || "Failed to fetch vehicle registration details.",
            err.response?.data || err.message,
        );
    }
};
