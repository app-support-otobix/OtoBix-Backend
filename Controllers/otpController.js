

require("dotenv").config();
const crypto = require("crypto");
const twilio = require("twilio");

// Twilio credentials from .env
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

const twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

// In-memory OTP store (requestId -> record)
const otpStore = new Map(); // { mobile, otp, verified, createdAt, attempts }
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_OTP_ATTEMPTS = 5;

// Helper: common response
const sendResponse = (res, httpStatus, success, message, data = null) => {
  return res.status(httpStatus).json({ success, message, data });
};

// Helper: generate OTP & requestId
const generateOtp = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

const generateRequestId = () => crypto.randomBytes(16).toString("hex");

// Helper: format Indian mobile to E.164 with +91
const formatIndianNumber = (mobile) => {
  if (!mobile) return null;

  let cleaned = mobile.toString().trim();

  // Already E.164
  if (cleaned.startsWith("+")) {
    return cleaned;
  }

  // Remove everything except digits
  cleaned = cleaned.replace(/\D/g, "");

  // Remove leading 0 if present
  if (cleaned.startsWith("0")) {
    cleaned = cleaned.slice(1);
  }

  // Now prepend +91
  return `+91${cleaned}`;
};



/* ======================= SEND OTP ======================= */
exports.sendOtp = async (req, res) => {
  const { mobile } = req.body;

  if (!mobile) {
    // Match Flutter's handling: internalStatusCode "102" → invalid details
    return sendResponse(
      res,
      200,
      false,
      "Mobile number is required.",
      {
        statusCode: 102,
        requestId: null,
      }
    );
  }

  const formattedMobile = formatIndianNumber(mobile);

  try {
    const otp = generateOtp();
    const requestId = generateRequestId();

    // Store OTP in memory
    otpStore.set(requestId, {
      mobile: formattedMobile,
      otp,
      verified: false,
      createdAt: Date.now(),
      attempts: 0,
    });

    // Send SMS via Twilio
    await twilioClient.messages.create({
      from: TWILIO_PHONE_NUMBER,
      to: formattedMobile,
      body: `Your OtoBix OTP code is ${otp}`,
    });

    // ✅ Success → internalStatusCode "101"
    return sendResponse(res, 200, true, "OTP request sent successfully.", {
      statusCode: 101,
      requestId,
    });
  } catch (err) {
    console.error("Error sending OTP:", err?.message || err);

    // Generic failure → Flutter will show "Failed to send OTP"
    return sendResponse(
      res,
      500,
      false,
      "Failed to send OTP.",
      {
        statusCode: 500,
        error: err?.message || String(err),
      }
    );
  }
};



/* ======================= VERIFY OTP ======================= */
exports.verifyOtp = async (req, res) => {
  const { requestId, otp } = req.body;

  if (!requestId || !otp) {
    // Missing fields → treat as invalid OTP (102)
    return sendResponse(
      res,
      200,
      false,
      "requestId and otp are required.",
      {
        statusCode: 102,
      }
    );
  }

  try {
    const record = otpStore.get(requestId);

    if (!record) {
      // Unknown requestId → invalid OTP flow
      return sendResponse(res, 200, false, "Invalid requestId.", {
        statusCode: 102,
      });
    }

    // Check retry limit first
    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      return sendResponse(res, 200, false, "Retry limit exceeded.", {
        statusCode: 104,
      });
    }

    // Check expiry
    if (Date.now() - record.createdAt > OTP_TTL_MS) {
      // You can delete it if you like
      otpStore.delete(requestId);
      return sendResponse(res, 200, false, "OTP expired.", {
        statusCode: 102, // Flutter will show "Invalid OTP"
      });
    }

    // Wrong OTP
    if (record.otp !== otp) {
      record.attempts += 1;
      otpStore.set(requestId, record);

      if (record.attempts >= MAX_OTP_ATTEMPTS) {
        return sendResponse(res, 200, false, "Retry limit exceeded.", {
          statusCode: 104, // Flutter: "Retry Limit Exceeded"
        });
      }

      return sendResponse(res, 200, false, "Invalid OTP.", {
        statusCode: 102, // Flutter: "Invalid OTP"
      });
    }

    // ✅ Correct OTP
    record.verified = true;
    otpStore.set(requestId, record);

    return sendResponse(res, 200, true, "OTP verified successfully.", {
      statusCode: 101, // Flutter: success path
      mobile: record.mobile,
    });
  } catch (err) {
    console.error("Error verifying OTP:", err?.message || err);
    return sendResponse(
      res,
      500,
      false,
      "Failed to verify OTP.",
      {
        statusCode: 500,
        error: err?.message || String(err),
      }
    );
  }
};


// ======================= FETCH DETAILS =======================
exports.fetchDetails = async (req, res) => {
  const { requestId, caseId } = req.body;

  if (!requestId) {
    return sendResponse(res, 400, false, "requestId is required.");
  }

  try {
    const record = otpStore.get(requestId);

    if (!record) {
      return sendResponse(res, 404, false, "No details found for requestId.", {
        statusCode: 404,
        result: null,
        caseId: null,
      });
    }

    const effectiveCaseId = caseId || record.caseId || null;

    // Mimic a "details" response with whatever we have
    return sendResponse(
      res,
      200,
      true,
      "Fetched details successfully.",
      {
        statusCode: 200,
        result: {
          mobile: record.mobile,
          verified: record.verified,
          createdAt: record.createdAt,
        },
        caseId: effectiveCaseId,
      }
    );
  } catch (err) {
    console.error("Error fetching details:", err?.message || err);
    return sendResponse(
      res,
      500,
      false,
      "Failed to fetch details.",
      err?.message || err
    );
  }
};



// Exports for loginOrRegisterUsingOtp api
exports.otpStore = otpStore;
exports.OTP_TTL_MS = OTP_TTL_MS;
exports.MAX_OTP_ATTEMPTS = MAX_OTP_ATTEMPTS;
exports.formatIndianNumber = formatIndianNumber;






//////////////////////////////// Perfios OTP //////////////////////////////////

// require("dotenv").config();
// const axios = require("axios");

// // Perfios credentials from .env
// const BASE_URL = process.env.PERFIOS_BASE_URL;
// const API_KEY = process.env.PERFIOS_API_KEY;

// // Common headers
// const headers = {
//   "Content-Type": "application/json",
//   "x-auth-key": API_KEY,
// };

// // Helper for clean responses
// const sendResponse = (res, status, success, message, data = null) => {
//   res.status(status).json({ success, message, data });
// };

// // ======================= SEND OTP =======================
// exports.sendOtp = async (req, res) => {
//   const { mobile, caseId } = req.body;

//   if (!mobile) {
//     return sendResponse(res, 400, false, "Mobile number is required.");
//   }

//   try {
//     const payload = {
//       consent: "Y",
//       mobile,
//     };

//     // You can safely use userId as caseId
//     if (caseId) payload.clientData = { caseId };

//     const { data } = await axios.post(`${BASE_URL}/otp`, payload, { headers });


//     sendResponse(
//       res,
//       200,
//       true,
//       "OTP request sent successfully.",
//       {
//         statusCode: data["status-code"],
//         requestId: data["request_id"],
//         caseId: data?.clientData?.caseId || null,
//       }
//     );
//   } catch (err) {
//     console.error("Error sending OTP:", err.response?.data || err.message);
//     sendResponse(res, 500, false, "Failed to send OTP.", err.response?.data || err.message);
//   }
// };

// // ======================= VERIFY OTP =======================
// exports.verifyOtp = async (req, res) => {
//   const { requestId, otp, caseId } = req.body;

//   if (!requestId || !otp) {
//     return sendResponse(res, 400, false, "Both requestId and otp are required.");
//   }

//   try {
//     const payload = {
//       request_id: requestId,
//       otp,
//     };

//     if (caseId) payload.clientData = { caseId };

//     const { data } = await axios.post(`${BASE_URL}/status`, payload, { headers });

//     sendResponse(
//       res,
//       200,
//       true,
//       data.message || "OTP verified successfully.",
//       {
//         statusCode: data["status-code"],
//         result: data.result || {},
//         caseId: data?.clientData?.caseId || null,
//       }
//     );
//   } catch (err) {
//     console.error("Error verifying OTP:", err.response?.data || err.message);
//     sendResponse(res, 500, false, "Failed to verify OTP.", err.response?.data || err.message);
//   }
// };

// // ======================= FETCH DETAILS =======================
// exports.fetchDetails = async (req, res) => {
//   const { requestId, caseId } = req.body;

//   if (!requestId) {
//     return sendResponse(res, 400, false, "requestId is required.");
//   }

//   try {
//     const payload = {
//       request_id: requestId,
//     };

//     if (caseId) payload.clientData = { caseId };

//     const { data } = await axios.post(`${BASE_URL}/details`, payload, { headers });

//     sendResponse(
//       res,
//       200,
//       true,
//       data.message || "Fetched details successfully.",
//       {
//         statusCode: data["status-code"],
//         result: data.result || {},
//         caseId: data?.clientData?.caseId || null,
//       }
//     );
//   } catch (err) {
//     console.error("Error fetching details:", err.response?.data || err.message);
//     sendResponse(res, 500, false, "Failed to fetch details.", err.response?.data || err.message);
//   }
// };
