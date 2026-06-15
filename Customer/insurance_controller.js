// customer/insurance_controller.js
'use strict';

const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');
const axios = require('axios');
const InsuranceJourneyModel = require("../Models/insuranceJourneyModel");
const InsuranceQuotesModel = require('../Models/insuranceQuotesModel');

const policyBazaarBaseUrl = process.env.POLICY_BAZAAR_BASE_URL;
const policyBazaarQuotesToken = process.env.POLICY_BAZAAR_QUOTES_TOKEN;
const policyBazaarNewCarInsuranceToken = process.env.POLICY_BAZAAR_NEW_CAR_INSURANCE_TOKEN;

// ======================= COMMON HELPERS =======================
// POST JSON REQUEST
function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const body = JSON.stringify(payload);

    const req = https.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: `${parsedUrl.pathname}${parsedUrl.search}`,
        method: 'POST',
        headers: {
          accept: '*/*',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        let rawData = '';

        response.on('data', (chunk) => {
          rawData += chunk;
        });

        response.on('end', () => {
          let parsedData = rawData;

          try {
            parsedData = rawData ? JSON.parse(rawData) : {};
          } catch (err) {
            // if response is not JSON, return raw string
          }

          resolve({
            statusCode: response.statusCode || 500,
            data: parsedData,
          });
        });
      }
    );

    req.on('error', (error) => {
      reject(error);
    });

    req.write(body);
    req.end();
  });
}

// GENERATE UNIQUE PARTNER REFERENCE ID
async function generateUniquePartnerReferenceId() {
  let partnerReferenceId = '';
  let isExists = true;

  while (isExists) {
    partnerReferenceId = `OTB${Date.now()}${crypto
      .randomBytes(4)
      .toString('hex')
      .toUpperCase()}`;

    const existingDoc = await InsuranceQuotesModel.findOne({
      otobixPartnerReferenceId: partnerReferenceId,
    })
      .select('_id')
      .lean();

    isExists = !!existingDoc;
  }

  return partnerReferenceId;
}

// UPDATE INSURANCE LOG
async function updateInsuranceQuotesLog(logId, updateData) {
  return InsuranceQuotesModel.findByIdAndUpdate(logId, updateData, {
    new: true,
  });
}

// TO TRIM A STRING
function toTrimmedString(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
}

// TO NUMBER OR DEFAULT
function toNumberOrDefault(value, defaultValue = 0.0) {
    if (value === undefined || value === null || value === "") return defaultValue;
    const num = Number(value);
    return Number.isFinite(num) ? num : defaultValue;
}

// AXIOS INSTANCE
const axiosInstance = axios.create({
  baseURL: policyBazaarBaseUrl,
  headers: {
    'X-Api-Key': policyBazaarNewCarInsuranceToken,
    'Content-Type': 'application/json'
  },
  timeout: 10000,
});


// ======================= FETCH INSURANCE QUOTES API =======================
exports.fetchInsuranceQuotes = async (req, res) => {
  const { 
    userId, policyType, carType, // General fields for both
    registrationNumber, // Used car fields
    makeId, modelId, variantId, fuelTypeId, registeredCityId, regionCode, manufacturingDate, vehicleOwnedBy, // New car fields
    makeName, modelName, variantName, fuelType, stateName, cityName // Extra fields if new car
   } = req.body;

   const allIncomingBodyFields = {
      userId: userId || '',
      registrationNumber: registrationNumber || '',
      policyType: policyType || '',
      carType: carType || '',
      makeId: makeId || 0,
      modelId: modelId || 0,
      variantId: variantId || 0,
      fuelTypeId: fuelTypeId || 0,
      registeredCityId: registeredCityId || 0,
      regionCode: regionCode || '',
      manufacturingDate: manufacturingDate || null,
      vehicleOwnedBy: vehicleOwnedBy || 0,
      makeName: makeName || '',
      modelName: modelName || '',
      variantName: variantName || '',
      fuelType: fuelType || '',
      stateName: stateName || '',
      cityName: cityName || '',
   };

  //  console.log(allIncomingBodyFields);

  let insuranceLog = null;

  try {
    // 1) Create log first
    const partnerReferenceId = await generateUniquePartnerReferenceId();

    insuranceLog = await InsuranceQuotesModel.create({
      otobixMessage: 'Insurance quote request initiated.',
      otobixPartnerReferenceId: partnerReferenceId,
      status: 'Pending',
      pbMessage: '',
      pbResponseCode: '',
      pbPartnerReferenceId: '',
      redirectLink: '',
      quotes: [],
      pbResponse: {},
      ...allIncomingBodyFields,
    });

    // 2) Validate config
    if (!policyBazaarBaseUrl || !policyBazaarQuotesToken) {
      const otobixMessage = 'Policy Bazaar API configuration is missing in env.';

      await updateInsuranceQuotesLog(insuranceLog._id, {
        status: 'Failed',
        otobixMessage: otobixMessage,
      });

      return res.status(500).json({
        success: false,
        message: otobixMessage,
        data: {
          otobixPartnerReferenceId: insuranceLog.otobixPartnerReferenceId,
          pbPartnerReferenceId: '',
          pbResponseCode: '',
          pbMessage: '',
          redirectLink: '',
          statusTimestamp: '',
          quotes: [],
        },
      });
    }

    // 3) Validate request body
    const usedCarRequiredFields = ['userId', 'policyType', 'registrationNumber'];
    const newCarRequiredFields = ['userId', 'policyType', 'makeId', 'modelId', 'variantId', 'fuelTypeId', 'registeredCityId', 'regionCode', 'manufacturingDate' ];
   
    // pick fields based on carType
    const requiredFields =
    carType === 'Used Car' ? usedCarRequiredFields : newCarRequiredFields;

    // find missing fields
    const missingFields = requiredFields.filter(field => {
  const value = req.body[field];
  return value === undefined || value === null || value === '';
});

    if (missingFields.length > 0) {
    const otobixMessage = `Missing required fields: ${missingFields.join(', ')}`;

    await updateInsuranceQuotesLog(insuranceLog._id, {
      status: 'Failed',
      otobixMessage: otobixMessage,
    });

    return res.status(400).json({
      success: false,
      message: otobixMessage,
      data: {
          otobixPartnerReferenceId: insuranceLog.otobixPartnerReferenceId,
          pbPartnerReferenceId: '',
          pbResponseCode: '',
          pbMessage: '',
          redirectLink: '',
          statusTimestamp: '',
          quotes: [],
        },
      });
    }

    // 4) Call PolicyBazaar API
    const basePayload = {
      Token: policyBazaarQuotesToken,
      PartnerReferenceId: insuranceLog.otobixPartnerReferenceId,
      PolicyType: policyType,
    };

    const payload =
    carType === 'Used Car'
    ? {
        ...basePayload,
        RegistrationNumber: registrationNumber,
      }
    : {
        ...basePayload,
        RegistrationNumber: '',
        MakeId: makeId || 0,
        ModelId: modelId || 0,
        VariantId: variantId || 0,
        FuelTypeId: fuelTypeId || 0,
        RegistrationCode: registeredCityId || 0,
        RegistrationRtoCode: regionCode || '',
        ManufacturingDate: manufacturingDate || null,
        VehicleOwnedBy: vehicleOwnedBy || 0,
      };

    const response = await postJson(`${policyBazaarBaseUrl}/Partner/Quotes`, payload);

    const pbResponse = response?.data || {};
    const pbInnerData = pbResponse?.data || {};

    const pbResponseCode = pbResponse?.responseCode ?? '';
    const pbMessage = pbResponse?.message || '';
    const pbPartnerReferenceId =
      pbInnerData?.pbpReferenceId ||
      pbInnerData?.partnerReferenceId ||
      '';
    const redirectLink = pbInnerData?.redirectLink || '';
    const statusTimestamp = pbInnerData?.statusTimestamp || '';
    const quotes = Array.isArray(pbInnerData?.quotes) ? pbInnerData.quotes : [];

    const isSuccess = response.statusCode === 200;
      // && (pbResponseCode === 1 || pbResponseCode === '1');

    const otobixMessage = isSuccess
      ? 'Insurance quote response fetched successfully.'
      : 'Failed to fetch insurance quote response.';

    const updatedLog = await updateInsuranceQuotesLog(insuranceLog._id, {
      status: isSuccess ? 'Success' : 'Failed',
      otobixMessage: otobixMessage,
      pbMessage: pbMessage,
      pbResponseCode: String(pbResponseCode),
      pbPartnerReferenceId: pbPartnerReferenceId,
      redirectLink: redirectLink,
      quotes: quotes,
      pbResponse: pbResponse,
    });

    return res.status(isSuccess ? 200 : response.statusCode).json({
      success: isSuccess,
      message: otobixMessage,
      data: {
        otobixPartnerReferenceId: updatedLog?.otobixPartnerReferenceId || '',
        pbPartnerReferenceId: updatedLog?.pbPartnerReferenceId || '',
        pbResponseCode: pbResponseCode,
        pbMessage: updatedLog?.pbMessage || '',
        redirectLink: updatedLog?.redirectLink || '',
        statusTimestamp: statusTimestamp,
        quotes: updatedLog?.quotes || [],
        pbResponse: updatedLog?.pbResponse || {},
      },
    });
  } catch (error) {
    console.log('Error in fetchInsuranceQuotes:', error);

    const otobixMessage = error.message || 'Internal Server Error';

    if (insuranceLog?._id) {
      await updateInsuranceQuotesLog(insuranceLog._id, {
        status: 'Failed',
        otobixMessage: otobixMessage,
        pbResponse: {
          error: error.message || error,
        },
      });
    }

    return res.status(500).json({
      success: false,
      message: otobixMessage,
      data: {
        otobixPartnerReferenceId: insuranceLog?.otobixPartnerReferenceId || '',
        pbPartnerReferenceId: '',
        pbResponseCode: '',
        pbMessage: '',
        redirectLink: '',
        statusTimestamp: '',
        quotes: [],
      },
    });
  }
};




// ======================= Callback API For Insurance Journey =======================
exports.callbackApiForInsuranceJourney = async (req, res) => {
    try {
      
        // 1) Read body
        const body = req.body || {};

        const otobixPartnerReferenceId = toTrimmedString(body.otobixPartnerReferenceId);
        const pbPartnerReferenceId = toTrimmedString(body.pbPartnerReferenceId);

        // 2) Validate required fields
        if (!otobixPartnerReferenceId || !pbPartnerReferenceId) {
            return res.status(400).json({
                success: false,
                message: "otobixPartnerReferenceId and pbPartnerReferenceId are required.",
            });
        }

        // 3) Build payload from body
        const payload = {
            otobixPartnerReferenceId,
            pbPartnerReferenceId,
            insurerName: toTrimmedString(body.insurerName),
            policyType: toTrimmedString(body.policyType),
            idv: toNumberOrDefault(body.idv, 0.0),
            premiumAmount: toNumberOrDefault(body.premiumAmount, 0.0),
            customerName: toTrimmedString(body.customerName),
            mobileNumber: toTrimmedString(body.mobileNumber),
            emailId: toTrimmedString(body.emailId),
            policyNumber: toTrimmedString(body.policyNumber),
            policyCopy: toTrimmedString(body.policyCopy),
            statusTimestamp: toTrimmedString(body.statusTimestamp),
            remarks: toTrimmedString(body.remarks),
            status: toTrimmedString(body.status) || "Pending",
            // callbackResponse: body,
        };

        // 4) Check if journey doc already exists
        const existingJourney = await InsuranceJourneyModel.findOne({
            otobixPartnerReferenceId,
            pbPartnerReferenceId,
        }).lean();

        if (existingJourney) {
            const updatedDoc = await InsuranceJourneyModel.findOneAndUpdate(
                {
                    otobixPartnerReferenceId,
                    pbPartnerReferenceId,
                },
                {
                    $set: {
                        ...payload,
                        callbackResponse: {
                            success: true,
                            message: "Insurance journey updated successfully.",
                        },
                    },
                },
                {
                    new: true,
                    runValidators: true,
                    audit: {
                        changedBy: "policy bazaar",
                        source: "insurance-callback-api",
                    },
                }
            );

            return res.status(200).json({
                success: true,
                message: "Insurance journey updated successfully.",
                data: updatedDoc,
            });
        }

        // 5) If not found in insuranceJourney, check insuranceQuotes
        const matchingQuote = await InsuranceQuotesModel.findOne({
            otobixPartnerReferenceId,
            pbPartnerReferenceId,
        })
            .select("userId registrationNumber")
            .lean();

        const createdDoc = await InsuranceJourneyModel.create({
            ...payload,
            userId: matchingQuote?.userId ? String(matchingQuote.userId).trim() : "",
            registrationNumber: matchingQuote?.registrationNumber
                ? String(matchingQuote.registrationNumber).trim()
                : "",
            callbackResponse: {
                success: true,
                message: "Insurance journey created successfully.",
            },
        });

        return res.status(200).json({
            success: true,
            message: "Insurance journey created successfully.",
            data: createdDoc,
        });
    } catch (err) {
        console.error("Error in callbackApiForInsuranceJourney: ", err?.message || err);
        return res.status(500).json({
            success: false,
            message: "Error processing insurance journey callback.",
            error: err?.message || String(err),
        });
    }
};



// ======================= Get RTO List =======================
exports.getInsuranceRtoList = async (req, res) => {
    try {
      if (!policyBazaarBaseUrl || !policyBazaarNewCarInsuranceToken) {
      return res.status(400).json({
            success: false,
            message: "PolicyBazaar configuration missing in env.",
        });}
        
        const response = await axiosInstance.get('/Master/GetRtoList');

        return res.status(200).json({
            success: true,
            message: "RTO list fetched successfully.",
            data: response?.data?.Data || [],
        });

    } catch (err) {
        console.error("Error in getInsuranceRtoList:", err?.message || err);
        return res.status(500).json({
            success: false,
            message: "Error processing rto list.",
            error: err?.message || String(err),
        });
    }
};



// ======================= Get Makes List =======================
exports.getInsuranceMakesList = async (req, res) => {
    try {
      if (!policyBazaarBaseUrl || !policyBazaarNewCarInsuranceToken) {
      return res.status(400).json({
            success: false,
            message: "PolicyBazaar configuration missing in env.",
        });}
      
      const response = await axiosInstance.get('/Master/GetMakeList');

      return res.status(200).json({
            success: true,
            message: "Makes list fetched successfully.",
            data: response?.data?.data || [],
        });

    } catch (err) {
        console.error("Error in getInsuranceMakesList:", err?.message || err);
        return res.status(500).json({
            success: false,
            message: "Error processing makes list.",
            error: err?.message || String(err),
        });
    }
};



// ======================= Get Models List =======================
exports.getInsuranceModelsList = async (req, res) => {
  try {
      if (!policyBazaarBaseUrl || !policyBazaarNewCarInsuranceToken) {
      return res.status(400).json({
            success: false,
            message: "PolicyBazaar configuration missing in env.",
        });}

    const { makeId } = req.query;
    if (!makeId) {
      return res.status(400).json({
        success: false,
        message: "makeId is required",
      });
    }
    
    const response = await axiosInstance.get(`/Master/GetModelList?makeId=${makeId}`);

    return res.status(200).json({
      success: true,
      message: "Models list fetched successfully.",
      data: response?.data?.data || [],
    });

  } catch (err) {
    console.error("Error in getInsuranceModelsList:", err.message);
    return res.status(500).json({
      success: false,
      message: "Error processing models list.",
      error: err.message,
    });
  }
};


// ======================= Get Variants List =======================
exports.getInsuranceVariantsList = async (req, res) => {
  try {
      if (!policyBazaarBaseUrl || !policyBazaarNewCarInsuranceToken) {
      return res.status(400).json({
            success: false,
            message: "PolicyBazaar configuration missing in env.",
        });}


    const { modelId } = req.query;
    if (!modelId) {
      return res.status(400).json({
        success: false,
        message: "modelId is required",
      });
    }

    const response = await axiosInstance.get(`/Master/GetVariantList?modelId=${modelId}`);

    return res.status(200).json({
      success: true,
      message: "Variant list fetched successfully.",
      data: response?.data?.data || [],
    });

  } catch (err) {
    console.error("Error in getInsuranceVariantList:", err.message);
    return res.status(500).json({
      success: false,
      message: "Error processing variant list.",
      error: err.message,
    });
  }
};



// ======================= Get Variants Using Fuel Type List =======================
exports.getInsuranceVariantsListUsingFuelType = async (req, res) => {
  try {
      if (!policyBazaarBaseUrl || !policyBazaarNewCarInsuranceToken) {
      return res.status(400).json({
            success: false,
            message: "PolicyBazaar configuration missing in env.",
        });}

    const { modelId, fuelTypeId } = req.query;
    if (!modelId || !fuelTypeId) {
      return res.status(400).json({
        success: false,
        message: "modelId and fuelTypeId are required",
      });
    }

    const response = await axiosInstance.get(`/Master/GetVariantList?modelId=${modelId}&fuelTypeId=${fuelTypeId}`);

    return res.status(200).json({
      success: true,
      message: "Variants list using fuel type fetched successfully.",
      data: response?.data?.data || [],
    });

  } catch (err) {
    console.error("Error in getInsuranceVariantsListUsingFuelType:", err.message);
    return res.status(500).json({
      success: false,
      message: "Error processing variants list using fuel type.",
      error: err.message,
    });
  }
};




// ======================= Get Generated Quotes List =======================
exports.getInsuranceGeneratedQuotesList = async (req, res) => {
  try {

    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    const quotesList = await InsuranceQuotesModel.find({
      userId,
      status: "Success",
      quotes: { $exists: true, $ne: [] },
    }).sort({ updatedAt: -1 });

    return res.status(200).json({
      success: true,
      message: "Generated quotes fetched successfully.",
      data: quotesList,
    });

  } catch (err) {
    console.error("Error in getInsuranceGeneratedQuotesList:", err.message);
    return res.status(500).json({
      success: false,
      message: "Error processing generated quotes list.",
      error: err.message,
    });
  }
};