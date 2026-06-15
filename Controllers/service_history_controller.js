// Controllers/service_history_controller.js

require("dotenv").config();
const axios = require("axios");
const CarPricesForPdiModel = require("../Models/carPricesForPdiModel");
const ServiceHistoryReportsModel = require("../Models/serviceHistoryReportsModel");
const { checkAndConsumeApiHitLimit } = require('../Helper Functions/api_hit_limit_helper');
const { getFinalNormalizedMakeModel } = require("../Helper Functions/make_model_normalize_helpers");
const Agenda = require('../Agenda/agenda');
const {
  scheduleCheckServiceHistoryReportStatusJob
} = require('../Agenda/Agenda Jobs/check_service_history_report_status_job');
const mongoose = require("mongoose");
const AgendaJobs = mongoose.connection.collection("agendaJobs");
const CONSTANTS = require('../Utils/constants');
const { getParentModelIdByModel, getFuelTypeIdByFuelType } = require("../Helper Functions/service_history_helpers");

// Attestr API URLs
const ATTESTR_URL = process.env.ATTESTR_RC_URL || "https://api.attestr.com/api/v2/public/checkx/rc";
const ATTESTR_BASIC_TOKEN = process.env.ATTESTR_BASIC_TOKEN;

// Carvaidya API URLs
const sampleServiceHistoryReportPdfUrl = process.env.SAMPLE_SERVICE_HISTORY_REPORT_PDF_URL;
const carvaidyaSubmitServiceHistoryUrl = process.env.CARVAIDYA_SUBMIT_SERVICE_HISTORY_URL;

// ======================= Minimal Helpers =======================
const sendResponse = (res, status, success, message, data = null) => {
    res.status(status).json({ success, message, data });
};

function convertDdMmYyyyToUtcDate(dateStr) {
  if (!dateStr) return null;
  const [dd, mm, yyyy] = dateStr.split("-");
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00+05:30`);
}
function toSentenceCase(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  return text[0].toUpperCase() + text.slice(1);
}

// ======================= Fetch Sample Serice History Pdf =======================
exports.fetchSampleServiceHistoryPdf = async (req, res) => {
    try {
        const pdfUrl = sampleServiceHistoryReportPdfUrl;
        if (!pdfUrl) {
        return sendResponse(res, 400, false, "Sample service history PDF URL not available.");
        }
        return sendResponse(res, 200, true, "Sample service history PDF URL fetched successfully", { pdfUrl });
    } catch (error) {
        console.error('fetchSampleServiceHistoryPdf error:', error);
        return sendResponse(res, 500, false, "Internal Server Error", { error: error?.message || error });
    }
};



// ======================= Fetch Serice History =======================
exports.fetchServiceHistory = async (req, res) => {
    try {
        const { registrationNumber, userId } = req.query;

        if (!registrationNumber || !userId) {
        return sendResponse(res, 500, false, "Registration number and user ID are required.");
        }

        // 1) Hit Attestr Api
    if (!ATTESTR_BASIC_TOKEN) {
        return sendResponse(res, 500, false, "Attestr API token missing.");
    }
    const isAllowed = await checkAndConsumeApiHitLimit({
  userId: userId || '',
  apiName: 'fetchServiceHistory',
  limit: 5, // How many times this api can be hit in a day
});

if (!isAllowed) {
  return sendResponse(res, 400, false, 'Request limit reached. It will reset tomorrow.');
}

    // ✅ Normalize to uppercase (and trim)
    const reg = String(registrationNumber).trim().toUpperCase();

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

             // Agar response kabhi wrapped aaye ya direct aaye, dono handle ho jayenge
        const result = data?.data?.result || data?.result || data;

        if (result?.valid === false) {
            return sendResponse(res, 400, false, "Invalid registration number or no data found.", {
                result: result,
            });
        }

        // Sirf required fields nikaal lo
        const vehicleDetails = {
            makerDescription: result?.makerDescription || '',
            makerModel: result?.makerModel || '',
            fuelType: result?.fuelType || '',
            bodyType: result?.bodyType || '',
            registered: result?.registered || '',
            ownerNumber: result?.ownerNumber || '',
            chassisNumber: result?.chassisNumber || '',
            engineNumber: result?.engineNumber || '',
        };

        // 2) Normalize Make and Model 
const normalized = await getFinalNormalizedMakeModel({
  makerDescription: vehicleDetails.makerDescription,
  makerModel: vehicleDetails.makerModel,
});

if (!normalized.ok) {
  return sendResponse(res, 400, false, normalized.message);
}

const { make, model } = normalized.data;

        // 3) Fetch service history price
const filter = {
  make: make.trim(),
  model: model.trim(),
};

const carPriceDoc = await CarPricesForPdiModel.findOne(filter).lean();

const serviceHistory = carPriceDoc?.serviceHistory;

if (!serviceHistory) {
  return sendResponse(
    res,
    400,
    false,
    "Can not provide service history for this vehicle."
  );
}
// Check if they are not zero or null
const { rate, gst, total, rounding } = serviceHistory;
const hasInvalidPrice =
  [rate, gst, total, rounding].some(
    (value) => value == null || value === 0
  );
if (hasInvalidPrice) {
  return sendResponse(
    res,
    400,
    false,
    "Can not provide service history for this vehicle."
  );
}
            const registrationDate = convertDdMmYyyyToUtcDate(vehicleDetails.registered);
            const ownerSerialNumber = parseInt(vehicleDetails.ownerNumber, 10) || 1;
            const fuelType = toSentenceCase(vehicleDetails.fuelType);
            const bodyType = toSentenceCase(vehicleDetails.bodyType);
            const chassisNumber = vehicleDetails.chassisNumber;
            const engineNumber = vehicleDetails.engineNumber;

                return sendResponse(res, 200, true, "Service history fetched successfully", {
                    make,
                    model,
                    registrationNumber,
                    chassisNumber,
                    engineNumber,
                    registrationDate,
                    fuelType,
                    bodyType,
                    ownerSerialNumber,
                    serviceHistory,
                });
    } catch (error) {
        console.error('fetchServiceHistory error:', error);
        return sendResponse(res, 500, false, "Internal Server Error", { error: error?.message || error });
    }
};




// ======================= Fetch Service History Reports List =======================
exports.fetchServiceHistoryReportsList = async (req, res) => {
  try {
    const { userId } = req.query;
    console.log("userId", userId);

    if (!userId) {
      return sendResponse(res, 400, false, "userId query parameter is required.");
    }

    const reportsList = await ServiceHistoryReportsModel
      .find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    return sendResponse(
      res,
      200,
      true,
      reportsList.length > 0
        ? "Service history reports list fetched successfully."
        : "No service history reports found.",
      { reportsList }
    );
  } catch (error) {
    console.error("fetchServiceHistoryReportsList error:", error);
    return sendResponse(
      res,
      500,
      false,
      "Internal Server Error",
      { error: error?.message || error }
    );
  }
};



// ======================= Submit Service History Request =======================
exports.submitServiceHistoryRequest = async (req, res) => {

  const submitServiceHistoryUrl = carvaidyaSubmitServiceHistoryUrl;

  try {

    const {
      paymentId,
      userId,
      registrationNumber,
      make,
      model,
      bodyType,
      registrationDate,
      fuelType,
      ownerSerialNumber,
      rate,
      gst,
      total,
      chassisNumber,
      engineNumber
    } = req.body;

    //  1. VALIDATE BODY 
    if (
      !paymentId ||
      !userId ||
      !registrationNumber ||
      !make ||
      !model ||
      rate == null ||
  total == null
    ) {
      return sendResponse(res, 400, false, "Required parameters are missing.");
    }

    // CHECK IF JOB ALREADY EXISTS
const existingJob = await AgendaJobs.findOne({
  name: CONSTANTS.AGENDA_JOBS.CHECK_SERVICE_HISTORY_REPORT_STATUS,
  "data.registrationNumber": registrationNumber,
  "data.userId": userId,
  "data.make": make,
  "data.model": model,
  disabled: { $ne: true }
});

if (existingJob) {
  return sendResponse(
    res,
    409,
    false,
    "Service history request already in progress for this vehicle."
  );
}

    //  2. CREATE INITIAL LOG DOC 
    const logDoc = await ServiceHistoryReportsModel.create({
      paymentId,
      userId,
      registrationNumber,
      chassisNumber,
      engineNumber,
      make,
      model,
      bodyType,
      registrationDate,
      fuelType,
      ownerSerialNumber,
      rate,
      gst,
      total,
      status: "Processing"
    });

    try {

      const parentModelId = await getParentModelIdByModel(model);
      const fuelTypeId = getFuelTypeIdByFuelType(fuelType);

      //  3. PREPARE FORM DATA 
      const formData = new URLSearchParams();

      formData.append('ClientName', "");
      formData.append('ClientMobile', "");
      formData.append('CategoryID', 103);
      formData.append('RegistrationNumber', registrationNumber);
      formData.append('ChassisNumber', chassisNumber || "");
      formData.append('EngineNumber', engineNumber || "");
      formData.append('ParentModelID', parentModelId);
      formData.append('FuelTypeID', fuelTypeId);
      formData.append('CityID', 629);
      formData.append('PackageID', "2114");
      formData.append('LicenseNumber', "OBT2F2BE6BD204C4F04B");

      //  4. CALL CARVAIDYA API 
      const carvaidyaResponse = await axios.post(
        submitServiceHistoryUrl,
        formData,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000
        }
      );

      //  5. VALIDATE CARVAIDYA RESPONSE 
      const responseData = carvaidyaResponse?.data;

      if (
        carvaidyaResponse.status === 200 &&
        responseData?.code === "true" &&
        responseData?.data?.length > 0 &&
        responseData?.data[0]?.requestID
      ) {

        const requestId = responseData.data[0].requestID;

        //  6. UPDATE DOC SUCCESS 
        const updatedDoc = await ServiceHistoryReportsModel.findByIdAndUpdate(
          logDoc._id,
          {
            status: "Pending",
            requestId: requestId,
            carVaidyaApiResponse: responseData
          },
          { new: true }
        );

        // 7. SCHEDULE CHECK SERVICE HISTORY REPORT STATUS JOB
       try {        
        const agenda = Agenda.getAgenda();
       
  await scheduleCheckServiceHistoryReportStatusJob(agenda, {
    requestId,
    licenseNumber: "OBT2F2BE6BD204C4F04B",
    registrationNumber,
    make,
    model,
    userId,
    reportDocId: updatedDoc._id.toString()
  });
} catch (jobError) {
  console.error("Failed to schedule service history job:", jobError);
}

        return sendResponse(
          res,
          200,
          true,
          "Service history request submitted successfully.",
          updatedDoc
        );
      }

      //  7. INVALID RESPONSE 
      await ServiceHistoryReportsModel.findByIdAndUpdate(
        logDoc._id,
        {
          status: "Failed",
          carVaidyaApiResponse: responseData
        }
      );

      return sendResponse(
        res,
        400,
        false,
        "Error submitting request.",
        responseData
      );

    } catch (apiError) {

      //  8. API CALL ERROR 
      await ServiceHistoryReportsModel.findByIdAndUpdate(
        logDoc._id,
        {
          status: "Failed",
          carVaidyaApiResponse: apiError?.response?.data || apiError.message
        }
      );

      console.error("CarVaidya API error:", apiError);

      return sendResponse(
        res,
        500,
        false,
        "Failed to submit request to CarVaidya API.",
        apiError?.response?.data || apiError.message
      );
    }

  } catch (error) {

    console.error("submitServiceHistoryRequest error:", error);

    return sendResponse(
      res,
      500,
      false,
      "Internal Server Error",
      error?.message || error
    );
  }
};












// const { processServiceHistoryReportFiles } = require('../Helper Functions/service_history_report_files_helper');

// exports.test = async (req, res) => {
//   try {
//     const {
//       reportPageUrl,
//       registrationNumber,
//       requestId,
//       make,
//       model,
//       serviceHistoryDocId
//     } = req.body;

//     if (!reportPageUrl || !registrationNumber) {
//       return res.status(400).json({
//         success: false,
//         message: 'reportPageUrl and registrationNumber are required.'
//       });
//     }

//     const result = await processServiceHistoryReportFiles({
//       reportPageUrl,
//       registrationNumber,
//       requestId,
//       make,
//       model,
//       serviceHistoryDocId
//     });

//     // API itself will not fail because helper is safe
//     return res.status(200).json({
//       success: result.success,
//       message: result.message,
//       data: result.data,
//       errors: result.errors
//     });
//   } catch (error) {
//     // Even controller catch is safe
//     return res.status(200).json({
//       success: false,
//       message: 'Test API handled an unexpected error safely.',
//       data: null,
//       errors: [error.message]
//     });
//   }
// };
