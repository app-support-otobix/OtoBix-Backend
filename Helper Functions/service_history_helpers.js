// Helper Functions/service_history_helpers.js

const ParentModelIdsForServiceHistoryModel = require('../Models/parentModelIdsForServiceHistoryModel');

function escapeRegex(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getParentModelIdByModel(model) {
  try {
    const cleanModel = String(model || "").trim();

    if (!cleanModel) {
      return 0;
    }

    const matches = await ParentModelIdsForServiceHistoryModel.find({
      parentModel: {
        $regex: new RegExp(`^${escapeRegex(cleanModel)}$`, "i"),
      },
    }).lean();

    if (!matches.length) {
      return 0;
    }

    if (matches.length > 1) {
      return 0;
    }

    return Number(matches[0].parentModelId) || 0;
  } catch (error) {
    console.error("getParentModelIdByModel error:", error);
    return 0;
  }
}

function getFuelTypeIdByFuelType(fuelType) {
  try {
    const cleanFuelType = String(fuelType || "").trim().toLowerCase();

    const fuelTypeMap = {
      cng: 1,
      diesel: 2,
      electric: 3,
      lpg: 4,
      petrol: 5,
      hybrid: 6,
    };

    return fuelTypeMap[cleanFuelType] || 0;
  } catch (error) {
    console.error("getFuelTypeIdByFuelType error:", error);
    return 0;
  }
}

module.exports = {
  getParentModelIdByModel,
  getFuelTypeIdByFuelType,
};