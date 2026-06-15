const User = require('../Models/userModel');
const jwt = require('jsonwebtoken');

const {
  isValidUserRole,
  verifyOtpFromStore,
  clearOtpRequest,
  findUserByPhoneNumberAndRole,
  findUserByPhoneNumberWithDifferentRole,
  createUserUsingOtp,
  updateUserWhatsappConsent,
  buildLoginResponse,
} = require("../Helper Functions/login_or_register_using_otp_helpers");



exports.login = async (req, res) => {
  try {
    const { userName, phoneNumber, password } = req.body;


    if (!userName || !phoneNumber || !password) {
      return res.status(400).json({ message: 'User Name, Contact Number, and Password are required' });
    }

    const user = await User.findOne({ userName: userName }).select('+password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.phoneNumber !== phoneNumber) {
      return res.status(401).json({ message: 'Invalid contact number' });
    }

    // if (user.password !== password) {
    //   return res.status(401).json({ message: 'Invalid password' });
    // }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }

    const token = jwt.sign(
      {
        id: user._id,
        userName: user.userName,
        userType: user.userRole
      },
      process.env.JWT_SECRET,
      // { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      { expiresIn: '3650d' } // ~10 years
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        imageUrl: user.image,
        userName: user.userName,
        userType: user.userRole,
        approvalStatus: user.approvalStatus,
        email: user.email,
        phoneNumber: user.phoneNumber,
        entityType: user.entityType,
        isStaff: user.isStaff ?? false,
        permissions: user.permissions ?? [],
      }
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
};





// Login or Register using OTP
exports.loginOrRegisterUsingOtp = async (req, res) => {
  try {
    const { requestId, otp, userRole, whatsappConsent, testPhoneNumber } = req.body;

    if (!requestId || !otp || !userRole) {
      return res.status(400).json({
        success: false,
        message: "Request ID, OTP, and User role are required.",
      });
    }

    if (!isValidUserRole(userRole)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user role provided.",
      });
    }

    const otpResult = await verifyOtpFromStore(requestId, otp, testPhoneNumber);

    if (!otpResult.success) {
      return res.status(otpResult.httpStatus).json(otpResult.body);
    }

    const verifiedMobile = otpResult.mobile;

    // 1. Same phone + same role => login
    const existingSameRoleUser = await findUserByPhoneNumberAndRole(
      verifiedMobile,
      userRole
    );

    if (existingSameRoleUser) {
       // Update whatsappConsent for existing user
      if (whatsappConsent !== undefined) {
        await updateUserWhatsappConsent(existingSameRoleUser._id, whatsappConsent);
        existingSameRoleUser.whatsappConsent = whatsappConsent;
      }

      clearOtpRequest(requestId);
      return res.status(200).json(buildLoginResponse(existingSameRoleUser, false));
    }

    // 2. Same phone + different role => error
    const existingDifferentRoleUser = await findUserByPhoneNumberWithDifferentRole(
      verifiedMobile,
      userRole
    );

    if (existingDifferentRoleUser) {
      clearOtpRequest(requestId);
      return res.status(409).json({
        success: false,
        message:
          "Another account already exists with this phone number and a different user role.",
      });
    }

    // 3. No account with this phone number => create new user
    const newUser = await createUserUsingOtp(userRole, verifiedMobile, whatsappConsent);

    clearOtpRequest(requestId);

    return res.status(200).json(buildLoginResponse(newUser, true));
  } catch (error) {
    console.error("Error in loginOrRegisterUsingOtp:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
      error: error?.message || error,
    });
  }
};