// customer/warranty_controller.js
'use strict';

const CarModel = require('../Models/carModel');
const WarrantyModel = require('../Models/warrantyModel');
const EwiIntegrationModel = require('../Models/ewiIntegrationModel');
const CarDetailsForCarsListModel = require('../Shared/car_details_for_cars_list_model');
const { ApiError, getWarrantyOptionsForCar } = require('../Helper Functions/get_warranty_options_helper');
require('dotenv').config();

// ======================= Fetch Inspected Cars List for Warranty =======================
// Fetch user's last 60 days inspected cars list from cars collection
// Filtered by inspectionDate (If not found then sendToAuctionApk) date (last 60 days) // change it to inspection date column from sheet
// Filter using warranty collection: Warranty is not purchased for these cars
// Filter using ewiIntegration collection: Callback is approved for these cars
exports.fetchInspectedCarsListForWarranty = async (req, res) => {
  const { phoneNumber } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      message: 'Contact number is required.',
    });
  }

  const contactNumber = phoneNumber;

  try {
    // ✅ 60 days threshold
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Get last 60 days inspected cars list from cars collection
    /////////////////////////////////////
    // Get all user's cars first
const userCars = await CarModel.find({ contactNumber }).sort({ updatedAt: -1 });
// helper to validate date
const isValidDate = (value) => {
  if (!value) return false;
  const d = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(d.getTime());
};
const userLastSixtyDaysInspectedCarsList = userCars.filter((car) => {
  const hasInspectionDate = isValidDate(car.inspectionDate);
  const hasAuctionDate = isValidDate(car.sendToAuctionApk);

  // ❌ If BOTH are missing → exclude car
  if (!hasInspectionDate && !hasAuctionDate) {
    return false;
  }

  // ✅ If inspectionDate exists → use it
  if (hasInspectionDate) {
    const inspectionDate = new Date(car.inspectionDate);
    return inspectionDate >= sixtyDaysAgo;
  }

  // ✅ Otherwise use sendToAuctionApk
  const sendToAuctionApkDate = new Date(car.sendToAuctionApk);
  return sendToAuctionApkDate >= sixtyDaysAgo;
});

    // const userLastSixtyDaysInspectedCarsList = await CarModel.find({
    //   contactNumber,
    //   // ✅ filter by inspectionDate (If not found then sendToAuctionApk) date (last 60 days)
    //   //   $or: [
    //   //   { inspectionDate: { $exists: true, $ne: null, $gte: sixtyDaysAgo } },
    //   //   { sendToAuctionApk: { $exists: true, $ne: null, $gte: sixtyDaysAgo } }
    //   // ]
    //   sendToAuctionApk: { $exists: true, $ne: null, $gte: sixtyDaysAgo },
    // }).sort({ updatedAt: -1 });
////////////////////////////////////////////////////////

    if (!userLastSixtyDaysInspectedCarsList || userLastSixtyDaysInspectedCarsList.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No cars found.',
        data: [],
      });
    }


     // ======================= Condition #1 (Warranty Exclusion) =======================
    // Exclude car if warranty doc exists with:
    // regNo == car.registrationNumber AND apiHitThrough == 'Get Warranty'
    // AND thirdPartyResponse.httpStatus is 200 or 201 or 409

    const registrationNumbers = userLastSixtyDaysInspectedCarsList
      .map((car) => (car.registrationNumber || '').toString().trim().toUpperCase())
      .filter((regNo) => !!regNo);

    let excludeRegNoSet = new Set();

    if (registrationNumbers.length > 0) {
      const warrantyDocs = await WarrantyModel.find(
        {
          regNo: { $in: registrationNumbers },
          apiHitThrough: 'Get Warranty',
          'thirdPartyResponse.httpStatus': { $in: [200, 201, 409] },
        },
        { regNo: 1 } // only need regNo
      ).lean();

      excludeRegNoSet = new Set(
        warrantyDocs
          .map((w) => (w.regNo || '').toString().trim().toUpperCase())
          .filter((r) => !!r)
      );
    }

    const filteredCarsList = userLastSixtyDaysInspectedCarsList.filter((car) => {
      const regNo = (car.registrationNumber || '').toString().trim().toUpperCase();
      // If warranty doc found with success response => exclude
      return !excludeRegNoSet.has(regNo);
    });

    if (!filteredCarsList || filteredCarsList.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No cars found.',
        data: [],
      });
    }

      // ======================= Condition #2 (Callback Approved Filter) =======================
    // Keep ONLY those cars whose ewiIntegration doc exists with:
    // registrationNumber == car.registrationNumber AND apiType == 'Ewi Callback' AND status == 'Approved'
    // If not found => exclude car

    const filteredRegNos = filteredCarsList
      .map((car) => (car.registrationNumber || '').toString().trim().toUpperCase())
      .filter((regNo) => !!regNo);

    let approvedCallbackRegNoSet = new Set();

    if (filteredRegNos.length > 0) {
      const approvedCallbackDocs = await EwiIntegrationModel.find(
        {
          registrationNumber: { $in: filteredRegNos },
          apiType: 'Ewi Callback',
          status: 'Approved',
        },
        { registrationNumber: 1 }
      ).lean();

      approvedCallbackRegNoSet = new Set(
        approvedCallbackDocs
          .map((d) => (d.registrationNumber || '').toString().trim().toUpperCase())
          .filter((r) => !!r)
      );
    }

    const finalCarsList = filteredCarsList.filter((car) => {
      const regNo = (car.registrationNumber || '').toString().trim().toUpperCase();
      return approvedCallbackRegNoSet.has(regNo); // ✅ keep only approved
    });

    if (!finalCarsList || finalCarsList.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No cars found.',
        data: [],
      });
    }

    // Format the cars list
    const finalFormatedCarsList = finalCarsList.map((car) =>
      CarDetailsForCarsListModel.setCarDetails(car)
    );


   

    return res.status(200).json({
      success: true,
      message: 'Cars fetched successfully.',
      data: finalFormatedCarsList,
    });
  } catch (error) {
    console.log('Error in fetchLastSixtyDaysInspectedCarsList:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      error: error.message,
    });
  }
};



// ======================= Fetch Warranty Options For Car =======================
exports.fetchWarrantyOptionsForCar = async (req, res) => {
  try {
    const registrationNumber = req.query.registrationNumber;

    const options = await getWarrantyOptionsForCar(registrationNumber);

    return res.status(200).json({
      success: true,
      message: 'Warranty options fetched successfully.',
      data: options,
    });
  } catch (error) {
    console.log('Error in fetchWarrantyOptionsForCar:', error);

    // Our custom known errors
    if (error instanceof ApiError) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
        data: [],
      });
    }

    // Unknown errors
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
      error: error.message,
    });
  }
};