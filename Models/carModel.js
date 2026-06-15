const mongoose = require('mongoose');
const { getObjectIdFromAppointmentId } = require("../Shared/change_appointmentId_to_hexa_decimal");
const appointmentIdToObjectIdPlugin = require('../Plugins/car_model_plugin_for_setting_appointment_id');
const { DEFAULT_CONFIG } = require('../Helper Functions/car_margin_helper');
const applyCarMargins = require('../Plugins/car_model_plugin_for_setting_margin');
const { convertToDoubleForMongo, doubleDefault } = require('../Utils/convert_to_double_for_mongo');
const pluginToUpdateDoubleValue = require('../Plugins/plugin_to_update_double_value');
const notifyCepAchievedPlugin = require('../Plugins/notify_cep_achieved_car_model_plugin');
const { Schema, Types } = mongoose;


const carSchema = new mongoose.Schema({
    // use appointmentId here as mongodb document id
    _id: { type: Schema.Types.ObjectId },

    // Taken from column: Timestamp
    timestamp: { type: Date },

    // Taken from column: Email Address
    emailAddress: { type: String },

    // Taken from column: Appointment ID
    appointmentId: { type: String, unique: true, required: true },

    // Taken from column: City
    city: { type: String },

    // Taken from column: Registration Type
    registrationType: { type: String },

    // Taken from column: RC Book Availability
    rcBookAvailability: { type: String },

    // Taken from column: RC Condition
    rcCondition: { type: String },

    // Taken from column: Registration Number
    registrationNumber: { type: String },

    // Taken from column: Registration Date
    registrationDate: { type: Date },

    // Taken from column: Fitness Till
    fitnessTill: { type: Date },

    // Taken from column: To be Scrapped
    toBeScrapped: { type: String },

    // Taken from column: Registration State
    registrationState: { type: String },

    // Taken from column: Registered RTO
    registeredRto: { type: String },

    // Taken from column: Owner Serial Number
    ownerSerialNumber: { type: Number },

    // Taken from column: Make
    make: { type: String },

    // Taken from column: Model
    model: { type: String },

    // Taken from column: Variant
    variant: { type: String },

    // Taken from column: Engine Number
    engineNumber: { type: String },

    // Taken from column: Chassis Number
    chassisNumber: { type: String },

    // Taken from column: Registered Owner
    registeredOwner: { type: String },

    // Taken from column: Registered address as per RC
    registeredAddressAsPerRc: { type: String },

    // Taken from column: Year Month of Manufacture
    yearMonthOfManufacture: { type: Date },

    // Taken from column: Fuel Type
    fuelType: { type: String },

    // Taken from column: Cubic Capacity
    cubicCapacity: { type: Number },

    // Taken from column: Hypothecation Details
    hypothecationDetails: { type: String },

    // Taken from column: Mismatch in RC
    mismatchInRc: { type: String },

    // Taken from column: Road Tax Validity
    roadTaxValidity: { type: String },

    // Taken from column: Tax Valid Till
    taxValidTill: { type: Date },

    // Taken from column: Insurance
    insurance: { type: String },

    // Taken from column: Insurance Policy Number
    insurancePolicyNumber: { type: String },

    // Taken from column: Insurance Validity
    insuranceValidity: { type: Date },

    // Taken from column: No Claim Bonus
    noClaimBonus: { type: String },

    // Taken from column: Mismatch in Insurance
    mismatchInInsurance: { type: String },

    // Taken from column: Duplicate Key
    duplicateKey: { type: String },

    // Taken from column: RTO NOC
    rtoNoc: { type: String },

    // Taken from column: RTO Form 28 (2 Nos)
    rtoForm28: { type: String },

    // Taken from column: Party Peshi
    partyPeshi: { type: String },

    // Taken from column: Additional Details
    additionalDetails: { type: String },

    // Taken from column: RC Tax Token
    rcTaxToken: { type: [String] },

    // Taken from column: Insurance Copy
    insuranceCopy: { type: [String] },

    // Taken from column: Both Keys
    bothKeys: { type: [String] },

    // Taken from column: FORM 26 GD Copy if RC is Lost
    form26GdCopyIfRcIsLost: { type: [String] },

    // Taken from column: Bonnet
    bonnet: { type: String },

    // Taken from column: Front Windshield
    frontWindshield: { type: String },

    // Taken from column: Roof
    roof: { type: String },

    // Taken from column: Front Bumper
    frontBumper: { type: String },

    // Taken from column: LHS Headlamp
    lhsHeadlamp: { type: String },

    // Taken from column: LHS Foglamp
    lhsFoglamp: { type: String },

    // Taken from column: RHS Headlamp
    rhsHeadlamp: { type: String },

    // Taken from column: RHS Foglamp
    rhsFoglamp: { type: String },

    // Taken from column: LHS Fender
    lhsFender: { type: String },

    // Taken from column: LHS ORVM
    lhsOrvm: { type: String },

    // Taken from column: LHS A Pillar
    lhsAPillar: { type: String },

    // Taken from column: LHS B Pillar
    lhsBPillar: { type: String },

    // Taken from column: LHS C Pillar
    lhsCPillar: { type: String },

    // Taken from column: LHS Front Alloy
    lhsFrontAlloy: { type: String },

    // Taken from column: LHS Front Tyre
    lhsFrontTyre: { type: String },

    // Taken from column: LHS Rear Alloy
    lhsRearAlloy: { type: String },

    // Taken from column: LHS Rear Tyre
    lhsRearTyre: { type: String },

    // Taken from column: LHS Front Door
    lhsFrontDoor: { type: String },

    // Taken from column: LHS Rear Door
    lhsRearDoor: { type: String },

    // Taken from column: LHS Running Border
    lhsRunningBorder: { type: String },

    // Taken from column: LHS Quarter Panel
    lhsQuarterPanel: { type: String },

    // Taken from column: Rear Bumper
    rearBumper: { type: String },

    // Taken from column: LHS Tail Lamp
    lhsTailLamp: { type: String },

    // Taken from column: RHS Tail Lamp
    rhsTailLamp: { type: String },

    // Taken from column: Rear Windshield
    rearWindshield: { type: String },

    // Taken from column: Boot Door
    bootDoor: { type: String },

    // Taken from column: Spare Tyre
    spareTyre: { type: String },

    // Taken from column: Boot Floor
    bootFloor: { type: String },

    // Taken from column: RHS Rear Alloy
    rhsRearAlloy: { type: String },

    // Taken from column: RHS Rear Tyre
    rhsRearTyre: { type: String },

    // Taken from column: RHS Front Alloy
    rhsFrontAlloy: { type: String },

    // Taken from column: RHS Front Tyre
    rhsFrontTyre: { type: String },

    // Taken from column: RHS Quarter Panel
    rhsQuarterPanel: { type: String },

    // Taken from column: RHS A Pillar
    rhsAPillar: { type: String },

    // Taken from column: RHS B Pillar
    rhsBPillar: { type: String },

    // Taken from column: RHS C Pillar
    rhsCPillar: { type: String },

    // Taken from column: RHS Running Border
    rhsRunningBorder: { type: String },

    // Taken from column: RHS Rear Door
    rhsRearDoor: { type: String },

    // Taken from column: RHS Front Door
    rhsFrontDoor: { type: String },

    // Taken from column: RHS ORVM
    rhsOrvm: { type: String },

    // Taken from column: RHS Fender
    rhsFender: { type: String },

    // Taken from column: Comments
    comments: { type: String },

    // Taken from column: Front Main
    frontMain: { type: [String] },

    // Taken from column: Bonnet (duplicate visual column)
    bonnetImages: { type: [String] },

    // Taken from column: Front Windshield (duplicate visual column)
    frontWindshieldImages: { type: [String] },

    // Taken from column: Roof (duplicate visual column)
    roofImages: { type: [String] },

    // Taken from column: Front Bumper (duplicate visual column)
    frontBumperImages: { type: [String] },

    // Taken from column: LHS Headlamp (duplicate visual column)
    lhsHeadlampImages: { type: [String] },

    // Taken from column: LHS Foglamp (duplicate visual column)
    lhsFoglampImages: { type: [String] },

    // Taken from column: RHS Headlamp (duplicate visual column)
    rhsHeadlampImages: { type: [String] },

    // Taken from column: RHS Foglamp (duplicate visual column)
    rhsFoglampImages: { type: [String] },

    // Taken from column: LHS Front at (45 Degree)
    lhsFront45Degree: { type: [String] },

    // Taken from column: LHS Fender (duplicate visual column)
    lhsFenderImages: { type: [String] },

    // Taken from column: LHS Front Alloy (duplicate visual column)
    lhsFrontAlloyImages: { type: [String] },

    // Taken from column: LHS Front Tyre (duplicate visual column)
    lhsFrontTyreImages: { type: [String] },

    // Taken from column: LHS Running Border (duplicate visual column)
    lhsRunningBorderImages: { type: [String] },

    // Taken from column: LHS ORVM (duplicate visual column)
    lhsOrvmImages: { type: [String] },

    // Taken from column: LHS A Pillar (duplicate visual column)
    lhsAPillarImages: { type: [String] },

    // Taken from column: LHS Front Door (duplicate visual column)
    lhsFrontDoorImages: { type: [String] },

    // Taken from column: LHS B Pillar (duplicate visual column)
    lhsBPillarImages: { type: [String] },

    // Taken from column: LHS Rear Door (duplicate visual column)
    lhsRearDoorImages: { type: [String] },

    // Taken from column: LHS C Pillar (duplicate visual column)
    lhsCPillarImages: { type: [String] },

    // Taken from column: LHS Rear Tyre (duplicate visual column)
    lhsRearTyreImages: { type: [String] },

    // Taken from column: LHS Rear Alloy (duplicate visual column)
    lhsRearAlloyImages: { type: [String] },

    // Taken from column: LHS Quarter Panel (duplicate visual column)
    lhsQuarterPanelImages: { type: [String] },

    // Taken from column: Rear Main
    rearMain: { type: [String] },

    // Taken from column: Rear with Boot Door Open
    rearWithBootDoorOpen: { type: String },

    // Taken from column: Rear Bumper (duplicate visual column)
    rearBumperImages: { type: [String] },

    // Taken from column: LHS Tail Lamp (duplicate visual column)
    lhsTailLampImages: { type: [String] },

    // Taken from column: RHS Tail Lamp (duplicate visual column)
    rhsTailLampImages: { type: [String] },

    // Taken from column: Rear Windshield (duplicate visual column)
    rearWindshieldImages: { type: [String] },

    // Taken from column: Spare Tyre (duplicate visual column)
    spareTyreImages: { type: [String] },

    // Taken from column: Boot Floor (duplicate visual column)
    bootFloorImages: { type: [String] },

    // Taken from column: RHS Rear (45 Degree)
    rhsRear45Degree: { type: [String] },

    // Taken from column: RHS Quarter Panel (duplicate visual column)
    rhsQuarterPanelImages: { type: [String] },

    // Taken from column: RHS Rear Alloy (duplicate visual column)
    rhsRearAlloyImages: { type: [String] },

    // Taken from column: RHS Rear Tyre (duplicate visual column)
    rhsRearTyreImages: { type: [String] },

    // Taken from column: RHS C Pillar (duplicate visual column)
    rhsCPillarImages: { type: [String] },

    // Taken from column: RHS Rear Door (duplicate visual column)
    rhsRearDoorImages: { type: [String] },

    // Taken from column: RHS B Pillar (duplicate visual column)
    rhsBPillarImages: { type: [String] },

    // Taken from column: RHS Front Door (duplicate visual column)
    rhsFrontDoorImages: { type: [String] },

    // Taken from column: RHS A Pillar (duplicate visual column)
    rhsAPillarImages: { type: [String] },

    // Taken from column: RHS Running Border (duplicate visual column)
    rhsRunningBorderImages: { type: [String] },

    // Taken from column: RHS Front Alloy (duplicate visual column)
    rhsFrontAlloyImages: { type: [String] },

    // Taken from column: RHS Front Tyre (duplicate visual column)
    rhsFrontTyreImages: { type: [String] },

    // Taken from column: RHS ORVM (duplicate visual column)
    rhsOrvmImages: { type: [String] },

    // Taken from column: RHS Fender (duplicate visual column)
    rhsFenderImages: { type: [String] },

    // Taken from column: Upper Cross Member
    upperCrossMember: { type: String },

    // Taken from column: Radiator Support
    radiatorSupport: { type: String },

    // Taken from column: Headlight Support
    headlightSupport: { type: String },

    // Taken from column: Lower Cross Member
    lowerCrossMember: { type: String },

    // Taken from column: LHS Apron
    lhsApron: { type: String },

    // Taken from column: RHS Apron
    rhsApron: { type: String },

    // Taken from column: Firewall
    firewall: { type: String },

    // Taken from column: Cowl Top
    cowlTop: { type: String },

    // Taken from column: Engine
    engine: { type: String },

    // Taken from column: Battery
    battery: { type: String },

    // Taken from column: Coolant
    coolant: { type: String },

    // Taken from column: Engine Oil Level Dipstick
    engineOilLevelDipstick: { type: String },

    // Taken from column: Engine Oil
    engineOil: { type: String },

    // Taken from column: Engine Mount
    engineMount: { type: String },

    // Taken from column: Engine Permisable Blow By
    enginePermisableBlowBy: { type: String },

    // Taken from column: Exhaust Smoke
    exhaustSmoke: { type: String },

    // Taken from column: Clutch
    clutch: { type: String },

    // Taken from column: Gear Shift
    gearShift: { type: String },

    // Taken from column: Comments on Engine :
    commentsOnEngine: { type: String },

    // Taken from column: Comments on Engine Oil :
    commentsOnEngineOil: { type: String },

    // Taken from column: Comments on Towing :
    commentsOnTowing: { type: String },

    // Taken from column: Comments on Transmission :
    commentsOnTransmission: { type: String },

    // Taken from column: Comments on Radiator
    commentsOnRadiator: { type: String },

    // Taken from column: Comments on Others :
    commentsOnOthers: { type: String },

    // Taken from column: Engine Bay
    engineBay: { type: [String] },

    // Taken from column: Apron (LHS RHS)
    apronLhsRhs: { type: [String] },

    // Taken from column: Battery (duplicate field)
    batteryImages: { type: [String] },

    // Taken from column: Additional Images
    additionalImages: { type: [String] },

    // Taken from column: Engine Sound
    engineSound: { type: [String] },

    // Taken from column: Exhaust Smoke (duplicate field)
    exhaustSmokeImages: { type: [String] },

    // Taken from column: Steering
    steering: { type: String },

    // Taken from column: Brakes
    brakes: { type: String },

    // Taken from column: Suspension
    suspension: { type: String },

    // Taken from column: Odometer Reading ( in kms )
    odometerReadingInKms: { type: Number },

    // Taken from column: Fuel Level
    fuelLevel: { type: String },

    // Taken from column: ABS
    abs: { type: String },

    // Taken from column: Electricals
    electricals: { type: String },

    // Taken from column: Rear Wiper Washer
    rearWiperWasher: { type: String },

    // Taken from column: Rear Defogger
    rearDefogger: { type: String },

    // Taken from column: Music System
    musicSystem: { type: String },

    // Taken from column: Stereo
    stereo: { type: String },

    // Taken from column: Inbuilt Speaker
    inbuiltSpeaker: { type: String },

    // Taken from column: External Speaker
    externalSpeaker: { type: String },

    // Taken from column: Steering Mounted Audio Control
    steeringMountedAudioControl: { type: String },

    // Taken from column: No. Of Power Windows
    noOfPowerWindows: { type: String },

    // Taken from column: Power Window Condition RHS Front
    powerWindowConditionRhsFront: { type: String },

    // Taken from column: Power Window Condition LHS Front
    powerWindowConditionLhsFront: { type: String },

    // Taken from column: Power Window Condition RHS Rear
    powerWindowConditionRhsRear: { type: String },

    // Taken from column: Power Window Condition LHS Rear
    powerWindowConditionLhsRear: { type: String },

    // Taken from column: Comment on Interior
    commentOnInterior: { type: String },

    // Taken from column: No. of Air Bags ( 0 - 16 )
    noOfAirBags: { type: Number },

    // Taken from column: Airbag Features Driver Side
    airbagFeaturesDriverSide: { type: String },

    // Taken from column: Airbag Features Co-Driver Side
    airbagFeaturesCoDriverSide: { type: String },

    // Taken from column: Airbag Features LHS A Pillar Curtain
    airbagFeaturesLhsAPillarCurtain: { type: String },

    // Taken from column: Airbag Features LHS B Pillar Curtain
    airbagFeaturesLhsBPillarCurtain: { type: String },

    // Taken from column: Airbag Features LHS C Pillar Curtain
    airbagFeaturesLhsCPillarCurtain: { type: String },

    // Taken from column: Airbag Features RHS A Pillar Curtain
    airbagFeaturesRhsAPillarCurtain: { type: String },

    // Taken from column: Airbag Features RHS B Pillar Curtain
    airbagFeaturesRhsBPillarCurtain: { type: String },

    // Taken from column: Airbag Features RHS C Pillar Curtain
    airbagFeaturesRhsCPillarCurtain: { type: String },

    // Taken from column: Sunroof
    sunroof: { type: String },

    // Taken from column: Leather Seats
    leatherSeats: { type: String },

    // Taken from column: Fabric Seats
    fabricSeats: { type: String },

    // Taken from column: Comments on Electricals :
    commentsOnElectricals: { type: String },

    // Taken from column: Meter Console with (Engine ON)
    meterConsoleWithEngineOn: { type: [String] },

    // Taken from column: Airbags
    airbags: { type: [String] },

    // Taken from column: Sunroof (duplicate visual column)
    sunroofImages: { type: [String] },

    // Taken from column: Front Seats from Driver side (Door open)
    frontSeatsFromDriverSideDoorOpen: { type: [String] },

    // Taken from column: Rear Seats from Right side (Door open)
    rearSeatsFromRightSideDoorOpen: { type: [String] },

    // Taken from column: Dashboard from rear Seat
    dashboardFromRearSeat: { type: [String] },

    // Taken from column: Reverse Camera
    reverseCamera: { type: String },

    // Taken from column: Additional Images (interior/exterior)
    additionalImages2: { type: [String] },

    // Taken from column: Air Conditioning Manual
    airConditioningManual: { type: String },

    // Taken from column: Air Conditioning Climate Control
    airConditioningClimateControl: { type: String },

    // Taken from column: Comments on A / C :
    commentsOnAC: { type: String },

    // Taken from column: Approved By
    approvedBy: { type: String },

    // Taken from column: Approval Date
    approvalDate: { type: Date },

    // Taken from column: Approval Time
    approvalTime: { type: Date },

    // Taken from column: Approval Status
    approvalStatus: { type: String },

    // Taken from column: Contact Number
    contactNumber: { type: String },

    // Taken from column: New Arrival Message
    newArrivalMessage: { type: Date },

    // Taken from column: Budget Car
    budgetCar: { type: String },

    // Taken from column: Status
    status: { type: String },

    // Taken from column: Price Discovery
    priceDiscovery: { type: Number },

    // Taken from column: Price Discovery By
    priceDiscoveryBy: { type: String },

    // Taken from column: Latlong
    latlong: { type: String },

    // Taken from column: Retail Associate
    retailAssociate: { type: String },

    // Taken from column: KM Range Level
    kmRangeLevel: { type: Number },

    // Taken from column: KM Range Level
    sendToAuctionApk: { type: Date, default: Date.now() },

    // Newly create fields
    ieName: { type: String, required: false, trim: true, default: '' },
    inspectionCity: { type: String, required: false, trim: true, default: '' },
    rcBookAvailabilityDropdownList: { type: [String], required: false, default: [] },
    fitnessValidity: { type: Date, required: false, default: null },
    yearAndMonthOfManufacture: { type: Date, required: false, default: null },
    mismatchInRcDropdownList: { type: [String], required: false, default: [] },
    insuranceDropdownList: { type: [String], required: false, default: [] },
    policyNumber: { type: String, required: false, trim: true, default: '' },
    mismatchInInsuranceDropdownList: { type: [String], required: false, default: [] },
    additionalDetailsDropdownList: { type: [String], required: false, default: [] },
    rcTokenImages: { type: [String], required: false, default: [] },
    insuranceImages: { type: [String], required: false, default: [] },
    duplicateKeyImages: { type: [String], required: false, default: [] },
    form26AndGdCopyIfRcIsLostImages: { type: [String], required: false, default: [] },
    bonnetDropdownList: { type: [String], required: false, default: [] },
    frontWindshieldDropdownList: { type: [String], required: false, default: [] },
    roofDropdownList: { type: [String], required: false, default: [] },
    frontBumperDropdownList: { type: [String], required: false, default: [] },
    lhsHeadlampDropdownList: { type: [String], required: false, default: [] },
    lhsFoglampDropdownList: { type: [String], required: false, default: [] },
    rhsHeadlampDropdownList: { type: [String], required: false, default: [] },
    rhsFoglampDropdownList: { type: [String], required: false, default: [] },
    lhsFenderDropdownList: { type: [String], required: false, default: [] },
    lhsOrvmDropdownList: { type: [String], required: false, default: [] },
    lhsAPillarDropdownList: { type: [String], required: false, default: [] },
    lhsBPillarDropdownList: { type: [String], required: false, default: [] },
    lhsCPillarDropdownList: { type: [String], required: false, default: [] },
    lhsFrontWheelDropdownList: { type: [String], required: false, default: [] },
    lhsFrontTyreDropdownList: { type: [String], required: false, default: [] },
    lhsRearWheelDropdownList: { type: [String], required: false, default: [] },
    lhsRearTyreDropdownList: { type: [String], required: false, default: [] },
    lhsFrontDoorDropdownList: { type: [String], required: false, default: [] },
    lhsRearDoorDropdownList: { type: [String], required: false, default: [] },
    lhsRunningBorderDropdownList: { type: [String], required: false, default: [] },
    lhsQuarterPanelDropdownList: { type: [String], required: false, default: [] },
    rearBumperDropdownList: { type: [String], required: false, default: [] },
    lhsTailLampDropdownList: { type: [String], required: false, default: [] },
    rhsTailLampDropdownList: { type: [String], required: false, default: [] },
    rearWindshieldDropdownList: { type: [String], required: false, default: [] },
    bootDoorDropdownList: { type: [String], required: false, default: [] },
    spareTyreDropdownList: { type: [String], required: false, default: [] },
    bootFloorDropdownList: { type: [String], required: false, default: [] },
    rhsRearWheelDropdownList: { type: [String], required: false, default: [] },
    rhsRearTyreDropdownList: { type: [String], required: false, default: [] },
    rhsFrontWheelDropdownList: { type: [String], required: false, default: [] },
    rhsFrontTyreDropdownList: { type: [String], required: false, default: [] },
    rhsQuarterPanelDropdownList: { type: [String], required: false, default: [] },
    rhsAPillarDropdownList: { type: [String], required: false, default: [] },
    rhsBPillarDropdownList: { type: [String], required: false, default: [] },
    rhsCPillarDropdownList: { type: [String], required: false, default: [] },
    rhsRunningBorderDropdownList: { type: [String], required: false, default: [] },
    rhsRearDoorDropdownList: { type: [String], required: false, default: [] },
    rhsFrontDoorDropdownList: { type: [String], required: false, default: [] },
    rhsOrvmDropdownList: { type: [String], required: false, default: [] },
    rhsFenderDropdownList: { type: [String], required: false, default: [] },
    commentsOnExteriorDropdownList: { type: [String], required: false, default: [] },
    frontMainImages: { type: [String], required: false, default: [] },
    bonnetClosedImages: { type: [String], required: false, default: [] },
    bonnetOpenImages: { type: [String], required: false, default: [] },
    frontBumperLhs45DegreeImages: { type: [String], required: false, default: [] },
    frontBumperRhs45DegreeImages: { type: [String], required: false, default: [] },
    lhsFullViewImages: { type: [String], required: false, default: [] },
    lhsFrontWheelImages: { type: [String], required: false, default: [] },
    lhsRearWheelImages: { type: [String], required: false, default: [] },
    lhsQuarterPanelWithRearDoorOpenImages: { type: [String], required: false, default: [] },
    lhsQuarterPanelWithRearDoorClosedImages: { type: [String], required: false, default: [] },
    rearMainImages: { type: [String], required: false, default: [] },
    bootDoorOpenImages: { type: [String], required: false, default: [] },
    bootDoorClosedImages: { type: [String], required: false, default: [] },
    rearBumperLhs45DegreeImages: { type: [String], required: false, default: [] },
    rearBumperRhs45DegreeImages: { type: [String], required: false, default: [] },
    rhsFullViewImages: { type: [String], required: false, default: [] },
    rhsQuarterPanelWithRearDoorOpenImages: { type: [String], required: false, default: [] },
    rhsQuarterPanelWithRearDoorClosedImages: { type: [String], required: false, default: [] },
    rhsRearWheelImages: { type: [String], required: false, default: [] },
    rhsFrontWheelImages: { type: [String], required: false, default: [] },
    upperCrossMemberDropdownList: { type: [String], required: false, default: [] },
    radiatorSupportDropdownList: { type: [String], required: false, default: [] },
    headlightSupportDropdownList: { type: [String], required: false, default: [] },
    lowerCrossMemberDropdownList: { type: [String], required: false, default: [] },
    lhsApronDropdownList: { type: [String], required: false, default: [] },
    rhsApronDropdownList: { type: [String], required: false, default: [] },
    firewallDropdownList: { type: [String], required: false, default: [] },
    cowlTopDropdownList: { type: [String], required: false, default: [] },
    engineDropdownList: { type: [String], required: false, default: [] },
    batteryDropdownList: { type: [String], required: false, default: [] },
    coolantDropdownList: { type: [String], required: false, default: [] },
    engineOilLevelDipstickDropdownList: { type: [String], required: false, default: [] },
    engineOilDropdownList: { type: [String], required: false, default: [] },
    engineMountDropdownList: { type: [String], required: false, default: [] },
    enginePermisableBlowByDropdownList: { type: [String], required: false, default: [] },
    exhaustSmokeDropdownList: { type: [String], required: false, default: [] },
    clutchDropdownList: { type: [String], required: false, default: [] },
    gearShiftDropdownList: { type: [String], required: false, default: [] },
    commentsOnEngineDropdownList: { type: [String], required: false, default: [] },
    commentsOnEngineOilDropdownList: { type: [String], required: false, default: [] },
    commentsOnTowingDropdownList: { type: [String], required: false, default: [] },
    commentsOnTransmissionDropdownList: { type: [String], required: false, default: [] },
    commentsOnRadiatorDropdownList: { type: [String], required: false, default: [] },
    commentsOnOthersDropdownList: { type: [String], required: false, default: [] },
    engineBayImages: { type: [String], required: false, default: [] },
    lhsApronImages: { type: [String], required: false, default: [] },
    rhsApronImages: { type: [String], required: false, default: [] },
    additionalEngineImages: { type: [String], required: false, default: [] },
    engineVideo: { type: [String], required: false, default: [] },
    exhaustSmokeVideo: { type: [String], required: false, default: [] },
    steeringDropdownList: { type: [String], required: false, default: [] },
    brakesDropdownList: { type: [String], required: false, default: [] },
    suspensionDropdownList: { type: [String], required: false, default: [] },
    odometerReadingBeforeTestDrive: { type: Number, required: false, default: 0 },
    rearWiperWasherDropdownList: { type: [String], required: false, default: [] },
    rearDefoggerDropdownList: { type: [String], required: false, default: [] },
    infotainmentSystemDropdownList: { type: [String], required: false, default: [] },
    steeringMountedMediaControls: { type: String, required: false, trim: true, default: '' },
    steeringMountedSystemControls: { type: String, required: false, trim: true, default: '' },
    rhsFrontDoorFeaturesDropdownList: { type: [String], required: false, default: [] },
    lhsFrontDoorFeaturesDropdownList: { type: [String], required: false, default: [] },
    rhsRearDoorFeaturesDropdownList: { type: [String], required: false, default: [] },
    lhsRearDoorFeaturesDropdownList: { type: [String], required: false, default: [] },
    commentOnInteriorDropdownList: { type: [String], required: false, default: [] },
    driverAirbag: { type: String, required: false, trim: true, default: '' },
    coDriverAirbag: { type: String, required: false, trim: true, default: '' },
    coDriverSeatAirbag: { type: String, required: false, trim: true, default: '' },
    lhsCurtainAirbag: { type: String, required: false, trim: true, default: '' },
    lhsRearSideAirbag: { type: String, required: false, trim: true, default: '' },
    driverSeatAirbag: { type: String, required: false, trim: true, default: '' },
    rhsCurtainAirbag: { type: String, required: false, trim: true, default: '' },
    rhsRearSideAirbag: { type: String, required: false, trim: true, default: '' },
    sunroofDropdownList: { type: [String], required: false, default: [] },
    seatsUpholstery: { type: String, required: false, trim: true, default: '' },
    meterConsoleWithEngineOnImages: { type: [String], required: false, default: [] },
    airbagImages: { type: [String], required: false, default: [] },
    frontSeatsFromDriverSideImages: { type: [String], required: false, default: [] },
    rearSeatsFromRightSideImages: { type: [String], required: false, default: [] },
    dashboardImages: { type: [String], required: false, default: [] },
    reverseCameraDropdownList: { type: [String], required: false, default: [] },
    additionalInteriorImages: { type: [String], required: false, default: [] },
    acTypeDropdownList: { type: String, required: false, trim: true, default: '' },
    acCoolingDropdownList: { type: String, required: false, trim: true, default: '' },
    chassisEmbossmentImages: { type: [String], required: false, default: [] },
    chassisDetails: { type: String, required: false, trim: true, default: '' },
    vinPlateImages: { type: [String], required: false, default: [] },
    vinPlateDetails: { type: String, required: false, trim: true, default: '' },
    roadTaxImages: { type: [String], required: false, default: [] },
    seatingCapacity: { type: Number, required: false, default: 0 },
    color: { type: String, required: false, trim: true, default: '' },
    numberOfCylinders: { type: Number, required: false, default: 0 },
    norms: { type: String, required: false, trim: true, default: '' },
    hypothecatedTo: { type: String, required: false, trim: true, default: '' },
    insurer: { type: String, required: false, trim: true, default: '' },
    pucImages: { type: [String], required: false, default: [] },
    pucValidity: { type: Date, required: false, default: null },
    pucNumber: { type: String, required: false, trim: true, default: '' },
    rcStatus: { type: String, required: false, trim: true, default: '' },
    blacklistStatus: { type: String, required: false, trim: true, default: '' },
    rtoNocImages: { type: [String], required: false, default: [] },
    rtoForm28Images: { type: [String], required: false, default: [] },
    frontWiperAndWasherDropdownList: { type: [String], required: false, default: [] },
    frontWiperAndWasherImages: { type: [String], required: false, default: [] },
    lhsRearFogLampDropdownList: { type: [String], required: false, default: [] },
    lhsRearFogLampImages: { type: [String], required: false, default: [] },
    rhsRearFogLampDropdownList: { type: [String], required: false, default: [] },
    rhsRearFogLampImages: { type: [String], required: false, default: [] },
    rearWiperAndWasherImages: { type: [String], required: false, default: [] },
    spareWheelDropdownList: { type: [String], required: false, default: [] },
    spareWheelImages: { type: [String], required: false, default: [] },
    cowlTopImages: { type: [String], required: false, default: [] },
    firewallImages: { type: [String], required: false, default: [] },
    lhsSideMemberDropdownList: { type: [String], required: false, default: [] },
    rhsSideMemberDropdownList: { type: [String], required: false, default: [] },
    transmissionTypeDropdownList: { type: [String], required: false, default: [] },
    driveTrainDropdownList: { type: [String], required: false, default: [] },
    commentsOnClusterMeterDropdownList: { type: [String], required: false, default: [] },
    irvm: { type: String, required: false, trim: true, default: '' },
    dashboardDropdownList: { type: [String], required: false, default: [] },
    acImages: { type: [String], required: false, default: [] },
    reverseCameraImages: { type: [String], required: false, default: [] },
    driverSideKneeAirbag: { type: String, required: false, trim: true, default: '' },
    coDriverKneeSeatAirbag: { type: String, required: false, trim: true, default: '' },
    driverSeatDropdownList: { type: [String], required: false, default: [] },
    coDriverSeatDropdownList: { type: [String], required: false, default: [] },
    frontCentreArmRestDropdownList: { type: [String], required: false, default: [] },
    rearSeatsDropdownList: { type: [String], required: false, default: [] },
    thirdRowSeatsDropdownList: { type: [String], required: false, default: [] },
    odometerReadingAfterTestDriveImages: { type: [String], required: false, default: [] },
    odometerReadingAfterTestDriveInKms: { type: Number, required: false, default: 0 },
    inspectionDate: { type: Date, required: false, default: null },


    // Added by Muhammad Ahsan new fields, dont get them from json when using api
    highestBid: {
        type: Number,
        default: 0
    },
    highestBidder: {
        type: String,
        default: ''
    },
    auctionStartTime: {
        type: Date,
        // default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from creation
    },
    auctionDuration: {
        type: Number,
        // default: 24 // hours
    },
    auctionEndTime: {
        type: Date,
        // default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
    },
    auctionStatus: {
        type: String,
        default: 'upcoming'
    },
    upcomingTime: {
        type: Number,
        // default: 10 // minutes 
    },
    upcomingUntil: {
        type: Date,
        // default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from creation
    },
    liveAt: {
        type: Date,
        // default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from creation
    },
    movedToOtobuyAt: { type: Date, required: false, default: null },
    oneClickPrice: { type: Number, default: 0 },
    otobuyOffer: { type: Number, default: 0 },
    soldAt: { type: Number, default: 0 },
    soldTo: { type: String, default: '', },
    reasonOfRemoval: { type: String, default: '' },
    removedBy: { type: String, default: '' },
    customerExpectedPrice: { type: Number, default: 0 },
    fixedMargin: { type: convertToDoubleForMongo(), default: doubleDefault(DEFAULT_CONFIG.fixedMargin) }, // in percentages like 2% alaways same 
    variableMargin: { type: convertToDoubleForMongo(), default: doubleDefault(0) }, // in percentages like 16%
    retailAssociateContactNumber: { type: String, default: '' },
    remarks: { type: String, default: '' },

    // Sagheer bhai fields
    appVersion: { type: String, default: '' },
    attesterRawCarDetails: { type: Map, default: {} },

}, { timestamps: true });



// ✅ Before saving doc, set appointmentId as mongodb document id for save
carSchema.plugin(appointmentIdToObjectIdPlugin, {
    appointmentField: 'appointmentId',
    objectIdSetter: getObjectIdFromAppointmentId,  // your existing function
});


// ✅ Before saving doc, set price margins on add car etc
carSchema.plugin(applyCarMargins, {
    priceField: 'priceDiscovery',
    fixedField: 'fixedMargin',
    variableField: 'variableMargin',
});

// ✅ Update double values on save
carSchema.plugin(pluginToUpdateDoubleValue, { paths: ['fixedMargin', 'variableMargin'] });

// ✅ Before updating highestBid/otobuyOffer, Notify CEP achieved
carSchema.plugin(notifyCepAchievedPlugin);



// // Before saving, set appointmentId as mongodb document id for save
// carSchema.pre("save", function (next) {
//     // Set document id to appointmentId 
//     if (!this._id && this.appointmentId) {
//         this._id = getObjectIdFromAppointmentId(this.appointmentId);
//     }
//     next();
// });

// // Before saving, set appointmentId as mongodb document id for insertMany
// carSchema.pre("insertMany", function (next, docs) {
//     for (const doc of docs) {
//         // Set document id to appointmentId
//         if (!doc._id && doc.appointmentId) {
//             doc._id = getObjectIdFromAppointmentId(doc.appointmentId);
//         }
//     }
//     next();
// });

// // Optional: if you use upserts, this hook ensures _id generation for findOneAndUpdate with upsert:true
// carSchema.pre('findOneAndUpdate', function (next) {
//     const update = this.getUpdate() || {};
//     // If caller provided appointmentId but no _id, set it deterministically
//     const appt = update.appointmentId || update.$set?.appointmentId;
//     if (appt && !update._id && !update.$set?._id) {
//         const oid = getObjectIdFromAppointmentId(appt);
//         if (update.$set) update.$set._id = oid; else update._id = oid;
//     }
//     next();
// });

module.exports = mongoose.model('CarModel', carSchema, 'cars');

