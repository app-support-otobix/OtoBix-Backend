// Helper Functions/login_or_register_using_otp_helpers.js
const jwt = require("jsonwebtoken");
const User = require("../Models/userModel");
const CONSTANTS = require("../Utils/constants");
require('dotenv').config();

// Adjust this path if your OTP controller path is different
const {
  otpStore,
  OTP_TTL_MS,
  MAX_OTP_ATTEMPTS,
} = require("../Controllers/otpController");

/* =========================================================
   COMMON HELPERS
========================================================= */
const successResult = (data = {}) => ({
  success: true,
  ...data,
});

const errorResult = (httpStatus, message, extra = {}) => ({
  success: false,
  httpStatus,
  body: {
    success: false,
    message,
    ...extra,
  },
});

/* =========================================================
   ROLE HELPERS
========================================================= */
const getAllowedUserRoles = () => Object.values(CONSTANTS.USER_ROLES);

const isValidUserRole = (userRole) => {
  return getAllowedUserRoles().includes(userRole);
};

/* =========================================================
   PHONE HELPERS
   IMPORTANT:
   - old OTP store may return +91XXXXXXXXXX
   - new OTP API should save/use XXXXXXXXXX only
========================================================= */
const normalizePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return null;

  let cleaned = String(phoneNumber).trim();

  if (cleaned.startsWith("+")) {
    cleaned = cleaned.slice(1);
  }

  cleaned = cleaned.replace(/\D/g, "");

  if (cleaned.startsWith("91") && cleaned.length > 10) {
    cleaned = cleaned.slice(2);
  }

  if (cleaned.startsWith("0") && cleaned.length > 10) {
    cleaned = cleaned.slice(1);
  }

  return cleaned; // final format: 9876543210
};

const getDigitsOnlyPhone = (phoneNumber) => {
  return normalizePhoneNumber(phoneNumber) || "";
};

const getPhoneVariants = (phoneNumber) => {
  const localNumber = normalizePhoneNumber(phoneNumber);

  if (!localNumber) return [];

  const variants = new Set();

  // new format
  variants.add(localNumber); // 9876543210

  // possible old/existing formats
  variants.add(`0${localNumber}`);   // 09876543210
  variants.add(`91${localNumber}`);  // 919876543210
  variants.add(`+91${localNumber}`); // +919876543210

  return [...variants];
};

/* =========================================================
   OTP HELPERS
========================================================= */
const verifyOtpFromStore = async (requestId, otp, testPhoneNumber) => {
  if (!requestId || !otp) {
    return errorResult(400, "requestId and otp are required.");
  }

  /////////////////// Test Account Logic Start //////////////////////
  const testPhoneNumberFromEnv = process.env.CUSTOMER_APP_TEST_ACCOUNT_PHONE_NUMBER;
  const testOtpFromEnv = process.env.CUSTOMER_APP_TEST_ACCOUNT_OTP;
  if (testPhoneNumber && (testPhoneNumberFromEnv === testPhoneNumber) && (String(otp) === String(testOtpFromEnv))) {
    return successResult({
      mobile: testPhoneNumber,
    });
  }
  /////////////////// Test Account Logic End //////////////////////

  const record = otpStore.get(requestId);

  if (!record) {
    return errorResult(200, "Invalid requestId.", {
      statusCode: 102,
    });
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    return errorResult(200, "Retry limit exceeded.", {
      statusCode: 104,
    });
  }

  if (Date.now() - record.createdAt > OTP_TTL_MS) {
    otpStore.delete(requestId);
    return errorResult(200, "OTP expired.", {
      statusCode: 102,
    });
  }

  if (record.otp !== otp) {
    record.attempts += 1;
    otpStore.set(requestId, record);

    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      return errorResult(200, "Retry limit exceeded.", {
        statusCode: 104,
      });
    }

    return errorResult(200, "Invalid OTP.", {
      statusCode: 102,
    });
  }

  record.verified = true;
  otpStore.set(requestId, record);

  return successResult({
    mobile: record.mobile,
    requestId,
  });
};

const clearOtpRequest = (requestId) => {
  if (requestId) {
    otpStore.delete(requestId);
  }
};

/* =========================================================
   USER FIND HELPERS
========================================================= */
const findUserByPhoneNumber = async (phoneNumber) => {
  const phoneVariants = getPhoneVariants(phoneNumber);

  if (!phoneVariants.length) return null;

  return await User.findOne({
    phoneNumber: { $in: phoneVariants },
  });
};

const findUserByPhoneNumberAndRole = async (phoneNumber, userRole) => {
  const phoneVariants = getPhoneVariants(phoneNumber);

  if (!phoneVariants.length) return null;

  return await User.findOne({
    phoneNumber: { $in: phoneVariants },
    userRole,
  });
};

const findUserByPhoneNumberWithDifferentRole = async (phoneNumber, userRole) => {
  const phoneVariants = getPhoneVariants(phoneNumber);

  if (!phoneVariants.length) return null;

  return await User.findOne({
    phoneNumber: { $in: phoneVariants },
    userRole: { $ne: userRole },
  });
};

const isUserNameTaken = async (userName) => {
  const user = await User.findOne({ userName });
  return !!user;
};

const isEmailTaken = async (email) => {
  const user = await User.findOne({ email });
  return !!user;
};

/* =========================================================
   AUTO-GENERATED USER DATA HELPERS
========================================================= */
const getDefaultPassword = () => {
  return process.env.DEFAULT_OTP_USER_PASSWORD || "Otobix@123";
};

const getDefaultLocation = () => {
  return "Not Provided";
};

const getDefaultAddressList = () => {
  return ["Not Provided"];
};

const buildBaseUserName = (phoneNumber) => {
  const digits = getDigitsOnlyPhone(phoneNumber);
  const last10 = digits.slice(-10) || "user";
  return `otobix_${last10}`;
};

const buildBaseEmail = (phoneNumber) => {
  const digits = getDigitsOnlyPhone(phoneNumber);
  const last10 = digits.slice(-10) || "user";
  return `otobix_${last10}@otobix.in`;
};

const generateUniqueUserName = async (phoneNumber) => {
  const baseUserName = buildBaseUserName(phoneNumber);

  let candidate = baseUserName;
  let counter = 1;

  while (await isUserNameTaken(candidate)) {
    candidate = `${baseUserName}_${counter}`;
    counter += 1;
  }

  return candidate;
};

const generateUniqueEmail = async (phoneNumber) => {
  const baseEmail = buildBaseEmail(phoneNumber);

  if (!(await isEmailTaken(baseEmail))) {
    return baseEmail;
  }

  const [localPart, domainPart] = baseEmail.split("@");

  let counter = 1;
  let candidate = `${localPart}_${counter}@${domainPart}`;

  while (await isEmailTaken(candidate)) {
    counter += 1;
    candidate = `${localPart}_${counter}@${domainPart}`;
  }

  return candidate;
};

const buildNewUserData = async (userRole, phoneNumber, whatsappConsent = false) => {
  const normalizedPhoneNumber = normalizePhoneNumber(phoneNumber);

  const userName = await generateUniqueUserName(normalizedPhoneNumber);
  const email = await generateUniqueEmail(normalizedPhoneNumber);

  const userData = {
    userRole,
    phoneNumber: normalizedPhoneNumber,
    location: getDefaultLocation(),
    userName,
    email,
    password: getDefaultPassword(),
    addressList: getDefaultAddressList(),
    approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED,
    whatsappConsent: whatsappConsent || false,
  };

  // Dealer-only required fields
  if (userRole === CONSTANTS.USER_ROLES.DEALER) {
    userData.dealershipName = "Not Provided";
    userData.entityType = "Not Provided";
    userData.primaryContactPerson = "Not Provided";
    userData.primaryContactNumber = normalizedPhoneNumber;
  }

  return userData;
};

const createUserUsingOtp = async (userRole, phoneNumber, whatsappConsent = false) => {
  const userData = await buildNewUserData(userRole, phoneNumber, whatsappConsent);
  const user = new User(userData);
  await user.save();
  return user;
};

const updateUserWhatsappConsent = async (userId, whatsappConsent) => {
  return await User.findByIdAndUpdate(
    userId,
    { whatsappConsent: whatsappConsent || false },
    { new: true }
  );
};

/* =========================================================
   LOGIN RESPONSE HELPERS
========================================================= */
const generateJwtToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      userName: user.userName,
      userType: user.userRole,
    },
    process.env.JWT_SECRET,
    { expiresIn: "3650d" }
  );
};

const buildLoggedInUserObject = (user) => {
  return {
    id: user._id,
    imageUrl: user.image,
    userName: user.userName,
    userRole: user.userRole,
    approvalStatus: user.approvalStatus,
    email: user.email,
    phoneNumber: user.phoneNumber,
    entityType: user.entityType,
    isStaff: user.isStaff ?? false,
    permissions: user.permissions ?? [],
  };
};

const buildLoginResponse = (user, isNewUser = false) => {
  const token = generateJwtToken(user);

  return {
    success: true,
    message: isNewUser
      ? "User registered and login successful"
      : "Login successful",
    statusCode: 101,
    token,
    user: buildLoggedInUserObject(user),
    isNewUser,
  };
};

module.exports = {
  isValidUserRole,
  verifyOtpFromStore,
  clearOtpRequest,
  findUserByPhoneNumber,
  findUserByPhoneNumberAndRole,
  findUserByPhoneNumberWithDifferentRole,
  createUserUsingOtp,
  updateUserWhatsappConsent,
  buildLoginResponse,
};