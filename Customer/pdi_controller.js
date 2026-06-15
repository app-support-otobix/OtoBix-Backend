// customer/pdi_controller.js
const CarPricesForPdiModel = require("../Models/carPricesForPdiModel");
const PdiRequestsModel = require("../Models/pdiRequestsModel");
const { getFinalNormalizedMakeModel } = require("../Helper Functions/make_model_normalize_helpers");



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
// ======================= Helpers End =======================



// ======================= Fetch PDI Price For a Car =======================
exports.fetchPdiPrice = async (req, res) => {
  try {
    const { make, model, type } = req.query;

    if (!make || !model) {
      return res.status(400).json({
        success: false,
        message: "make and model are required",
      });
    }

    // ✅ correct query (case-insensitive optional)
    const filter = {
      make: make.trim(),
      model: model.trim(),
    };

    // if you want to filter by type too (recommended since schema has it)
    if (type) filter.type = type.trim();

    const pdiPrice = await CarPricesForPdiModel.findOne(filter).lean();

    if (!pdiPrice) {
      return res.status(404).json({
        success: false,
        message: "No PDI price found for this car.",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "PDI price fetched successfully.",
      data: pdiPrice,
    });
  } catch (error) {
    console.log("Error in fetchaPdiPrice:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
      error: error?.message || error,
    });
  }
};




// ======================= Search Makes For PDI =======================
exports.searchCarMakesForPdi = async (req, res) => {
  try {
    const { q = "", limit = "20" } = req.body;
    const limitNum = parseLimit(limit);

    const makeRegex = buildTypeaheadRegex(q);

    const match = {};
    if (makeRegex) match.make = makeRegex;

    const rows = await CarPricesForPdiModel.aggregate([
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


// ======================= Search Models by Make For PDI =======================
exports.searchCarModelsByMakeForPdi = async (req, res) => {
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

    const match = { make: makeTrimmed };
    if (modelRegex) match.model = modelRegex;

    const rows = await CarPricesForPdiModel.aggregate([
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





// ======================= Submit PDI =======================
exports.submitPdi = async (req, res) => {
  // 1) create a record immediately (so we log every hit)
  let logDoc;
  try {
    logDoc = await PdiRequestsModel.create({
      paymentId: (req.body?.paymentId || "NA").toString(),
      pdiType: (req.body?.pdiType || "NA").toString(),
      userId: (req.body?.userId || "NA").toString(),
      userPhoneNumber: (req.body?.userPhoneNumber || "NA").toString(),

      make: (req.body?.make || "NA").toString(),
      model: (req.body?.model || "NA").toString(),
      fuelType: (req.body?.fuelType || "NA").toString(),
      transmissionType: (req.body?.transmissionType || "NA").toString(),

      // try parsing, if invalid keep current date just for logging
      inspectionDate: (() => {
        const d = new Date(req.body?.inspectionDate);
        return Number.isNaN(d.getTime()) ? new Date() : d;
      })(),

      customerType: ["Consumer", "Business"].includes(req.body?.customerType)
        ? req.body.customerType
        : "Consumer",

      billingAddress: (req.body?.billingAddress || "NA").toString(),
      visitAddress: (req.body?.visitAddress || "NA").toString(),
      pinCode: (req.body?.pinCode || "NA").toString(),

      rate: Number(req.body?.rate) || 0,
      gst: Number(req.body?.gst) || 0,
      total: Number(req.body?.total) || 0,

      registrationNumber: (req.body?.registrationNumber || "").toString(),
      isServiceHistoryProvided: Boolean(req.body?.isServiceHistoryProvided),

      status: "Pending",
      httpStatus: 102,
      responseBody: { stage: "RECEIVED" },
    });
  } catch (e) {
    // if even logging fails, return error
    console.log("Error creating PDI log doc:", e);
    return res.status(500).json({
      success: false,
      message: "Failed to create PDI request log",
      error: e.message,
    });
  }

  const fail = async (httpStatus, message) => {
    try {
      await PdiRequestsModel.findByIdAndUpdate(logDoc._id, {
        httpStatus,
        responseBody: { success: false, message },
      });
    } catch (e) {
      console.log("Error updating PDI log doc (FAILED):", e);
    }

    return res.status(httpStatus).json({ success: false, message });
  };

  try {
    const {
      paymentId,
      pdiType,
      userId,
      userPhoneNumber,
      make,
      model,
      fuelType,
      transmissionType,
      inspectionDate,
      customerType,
      billingAddress,
      visitAddress,
      pinCode,
      rate,
      gst,
      total,
      registrationNumber,
      isServiceHistoryProvided,
    } = req.body;

    // required field validation
    const requiredFields = {
      paymentId,
      pdiType,
      userId,
      userPhoneNumber,
      make,
      model,
      fuelType,
      transmissionType,
      inspectionDate,
      customerType,
      billingAddress,
      visitAddress,
      pinCode,
      rate,
      gst,
      total,
    };

    const missing = Object.entries(requiredFields)
      .filter(([_, v]) => v === undefined || v === null || String(v).trim() === "")
      .map(([k]) => k);

    if (missing.length) {
      return await fail(400, `Missing required fields: ${missing.join(", ")}`);
    }

    // validate date
    const dt = new Date(inspectionDate);
    if (Number.isNaN(dt.getTime())) {
      return await fail(400, "inspectionDate must be a valid ISO date string");
    }

    // validate customer type
    if (!["Consumer", "Business"].includes(customerType)) {
      return await fail(400, "customerType must be Consumer or Business");
    }

    // validate pincode (India 6 digits)
    if (!/^\d{6}$/.test(String(pinCode).trim())) {
      return await fail(400, "pinCode must be 6 digits");
    }

    // validate numbers
    const rateNum = Number(rate);
    const gstNum = Number(gst);
    const totalNum = Number(total);
    if (![rateNum, gstNum, totalNum].every((n) => Number.isFinite(n) && n >= 0)) {
      return await fail(400, "rate, gst, total must be valid non-negative numbers");
    }

    // prevent duplicate paymentId (ignore the current log doc itself)
    const duplicate = await PdiRequestsModel.findOne({
      paymentId: String(paymentId).trim(),
      _id: { $ne: logDoc._id },
    }).lean();

    if (duplicate) {
      return await fail(409, "This paymentId already exists (duplicate request).");
    }

    // ✅ success: update the same doc with final validated values
    const updated = await PdiRequestsModel.findByIdAndUpdate(
      logDoc._id,
      {
        paymentId: String(paymentId).trim(),
        pdiType: String(pdiType).trim(),
        userId: String(userId).trim(),
        userPhoneNumber: String(userPhoneNumber).trim(),

        make: String(make).trim(),
        model: String(model).trim(),
        fuelType: String(fuelType).trim(),
        transmissionType: String(transmissionType).trim(),

        inspectionDate: dt,
        customerType,

        billingAddress: String(billingAddress).trim(),
        visitAddress: String(visitAddress).trim(),
        pinCode: String(pinCode).trim(),

        rate: rateNum,
        gst: gstNum,
        total: totalNum,

        registrationNumber: registrationNumber ? String(registrationNumber).trim() : "",
        isServiceHistoryProvided: Boolean(isServiceHistoryProvided),

        httpStatus: 200,
        responseBody: {
          success: true,
          message: "PDI request submitted successfully.",
        },
      },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "PDI request submitted successfully.",
      data: updated,
    });
  } catch (error) {
    console.log("Error in submitPdi:", error);

    // update log doc
    try {
      await PdiRequestsModel.findByIdAndUpdate(logDoc._id, {
        httpStatus: 500,
        responseBody: {
          success: false,
          message: error.message || "Internal Server Error",
        },
      });
    } catch (e) {
      console.log("Error updating PDI log doc (ERROR):", e);
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
      error: error?.message || error,
    });
  }
};



// ======================= Normalize Make & Model =======================
exports.normalizeMakeModel = async (req, res) => {
  try {
    const { makerDescription, makerModel } = req.body || {};

    // // ✅ User-related validation errors (return to user)
    // if (!makerDescription || !makerModel) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "makerDescription and makerModel are required",
    //   });
    // }

    // // Load allowed list
    // const { promptBlock, allowedSet } = await loadAllowedMakeModel();

    // if (!promptBlock || promptBlock.length === 0) {
    //   console.log("Allowed make/model list is empty in database.");
    //   // return res.status(400).json({
    //   //   success: false,
    //   //   message: "Allowed make/model list is empty in database.",
    //   // });
    // }

    // const systemPrompt = buildSystemPrompt(promptBlock);

    // // Call OpenAI
    // const ai = await callOpenAIForNormalization({
    //   systemPrompt,
    //   makerDescription,
    //   makerModel,
    // });

    // // ❗ Not user-related: do NOT expose details, just log already done in helper
    // if (!ai.ok) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Unable to process right now. Please try again later.",
    //   });
    // }

    // // Parse JSON
    // const parsed = parseStrictJson(ai.text);
    // if (!parsed.ok) {
    //   // AI format issue - user-facing but generic
    //   console.log('Unable to normalize this input right now. Please retry.');
    //   // return res.status(400).json({
    //   //   success: false,
    //   //   message: "Unable to normalize this input right now. Please retry.",
    //   // });
    // }

    // const { make, model } = parsed.data || {};
    // if (!make || !model) {
    //     console.log("Normalization failed. Please retry.");
    //     // return res.status(400).json({
    //     //   success: false,
    //     //   message: "Normalization failed. Please retry.",
    //     // });
    // }

    // // Must be in allowed list (important user-related error)
    // const v = validateInAllowedList({ allowedSet, make, model });
    // if (!v.ok) {
    //   console.log("No valid make/model found from allowed list for this input.");
    //   // return res.status(400).json({
    //   //   success: false,
    //   //   message: "No valid make/model found from allowed list for this input.",
    //   // });
    // }

      const normalized = await getFinalNormalizedMakeModel({
      makerDescription,
      makerModel,
    });

    if (!normalized.ok) {
      return res.status(400).json({
        success: false,
        message: normalized.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: normalized.data,
    });
  } catch (error) {
    // Not user-related: log only
    console.error("normalizeMakeModel server error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
      error: error?.message || error,
    });
  }
};