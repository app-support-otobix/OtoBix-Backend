const mongoose = require('mongoose');
const CONSTANTS = require('../Utils/constants');
const { convertToDoubleForMongo, doubleDefault } = require('../Utils/convert_to_double_for_mongo');
const pluginToUpdateDoubleValue = require('../Plugins/plugin_to_update_double_value');
const applySelfInspectedCarMargins = require('../Plugins/self_inspected_car_model_plugin_for_setting_margin');
const selfInspectedCarInspectionIdGeneratePlugin = require('../Plugins/self_inspected_car_inspection_id_generate_plugin');

const selfInspectedCarsSchema = new mongoose.Schema({
  // ==================== RC Details (Auto Fetch) ====================
  inspectionId: { type: String, unique: true, trim: true },
  registrationNumber: { type: String, required: true, trim: true, uppercase: true },
  make: { type: String, trim: true },
  model: { type: String, trim: true },
  variant: { type: String, trim: true },
  roadTaxValidity: { type: String, trim: true },
  taxValidTill: { type: Date },
  registrationDate: { type: Date },
  fitnessValidity: { type: Date },
  engineNumber: { type: String, trim: true },
  chassisNumber: { type: String, trim: true },
  manufacturingDate: { type: Date },
  fuelType: { type: String },
  cubicCapacity: { type: Number, default: 0 },
  registrationState: { type: String, trim: true },
  registeredRTO: { type: String, trim: true },
  ownershipSerialNo: { type: Number, default: 0 },
  registeredOwner: { type: String, trim: true },
  registeredAddressAsPerRC: { type: String, trim: true },
  hypothecationDetails: { type: String, trim: true },
  financierName: { type: String, trim: true },
  insuranceValidity: { type: Date },
  rcStatus: { type: String, trim: true },
  blacklistStatus: { type: String, trim: true },
  pucValidityDate: { type: Date },
  pucNumber: { type: String, trim: true },

  // ==================== Images (Manual Entry) ====================
  frontMainImage: { type: String, required: true },
  rhsFullImage: { type: String, required: true },
  rearMainImage: { type: String, required: true },
  bootFloorImage: { type: String, required: true },
  lhsMainImage: { type: String, required: true },
  engineBayImage: { type: String, required: true },
  dashboardImage: { type: String, required: true },
  additionalImages: { type: [String], default: [] },

  // ==================== Vehicle Condition (Manual Entry) ====================
  odometer: { type: Number, default: 0 },
  accidentalStatus: { type: String, required: true },
  transmissionType: { type: String, required: true },
  clutch: { type: String, default: '' },
  suspension: { type: String, required: true },
  steering: { type: String, required: true },
  brake: { type: String, required: true },
  ac: { type: String, required: true },

  // ==================== Additional Details ====================
  expectedDateOfCarHandover: { type: Date },
  expectedPrice: { type: Number, default: 0 },
  additionalNotes: { type: String, trim: true },

  // ==================== System Fields ====================
  userId: { type: String, trim: true },
  auctionStatus: { type: String, default: CONSTANTS.SELF_INSPECTED_CARS_AUCTION_STATUS.SELF_INSPECTED },
  sellerContactNumber: { type: String, default: '' },
  priceDiscovery: { type: Number, default: 0 },
  priceDiscoveryBy: { type: String, default: '' },
  highestOffer: { type: Number, default: 0 },
  highestOfferBy: { type: String, default: '' },
  auctionStartTime: { type: Date },
  auctionEndTime: { type: Date },
  fixedMargin: { type: convertToDoubleForMongo(), default: doubleDefault(0) }, // in percentages like 2% alaways same 
  variableMargin: { type: convertToDoubleForMongo(), default: doubleDefault(0) }, // in percentages like 8%
  attestrPayload: { type: Object, default: {} },
  soldTo: { type: String, default: '' },
  soldAt: { type: Number, default: 0 },
  soldBy: { type: String, default: '' },
  qcBy: { type: String, default: '' },
},
  {
    timestamps: true
  });


// plugin to auto generate inspectionId
selfInspectedCarsSchema.plugin(selfInspectedCarInspectionIdGeneratePlugin, {
  field: "inspectionId",
  counterPrefix: "selfInspectedCarInspectionId",
});

// Set margins automatically when priceDiscovery(non-zero) is added 
selfInspectedCarsSchema.plugin(applySelfInspectedCarMargins, {
  priceField: 'priceDiscovery',
  fixedField: 'fixedMargin',
  variableField: 'variableMargin',
});

selfInspectedCarsSchema.plugin(pluginToUpdateDoubleValue, { paths: ['fixedMargin', 'variableMargin'] });

module.exports = mongoose.model("SelfInspectedCars", selfInspectedCarsSchema, "selfInspectedCars");
