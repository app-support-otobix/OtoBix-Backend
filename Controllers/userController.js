const User = require('../Models/userModel');
const sendEmail = require('../Utils/node_mailer');
const CONSTANTS = require('../Utils/constants');
const SocketService = require('../Config/socket_service');
const EVENTS = require('../Sockets/socket_events');
const KamModel = require('../Models/kamsModel');

// --------- Helpers ---------
// Convert assignedKam (kamId string) → KAM name
async function withKamNameForUsers(users) {
  const isArray = Array.isArray(users);
  const list = isArray ? users : [users];

  if (!list.length) return isArray ? [] : null;

  // Collect unique kamIds from users
  const kamIds = [
    ...new Set(
      list
        .map(u => (u && u.assignedKam ? String(u.assignedKam) : null))
        .filter(Boolean)
    ),
  ];

  let kamMap = new Map();
  if (kamIds.length) {
    const kams = await KamModel.find({ _id: { $in: kamIds } })
      .select('name')
      .lean();

    kamMap = new Map(kams.map(k => [String(k._id), k.name]));
  }

  const mapped = list.map((u) => {
    if (!u) return u;
    const obj = u.toObject ? u.toObject() : { ...u };

    if (obj.assignedKam) {
      obj.assignedKam = kamMap.get(String(obj.assignedKam)) || 'No KAM Assigned';
    } else {
      obj.assignedKam = 'No KAM Assigned';
    }

    return obj;
  });

  return isArray ? mapped : mapped[0];
}



// ----------- Functions -----------
exports.register = async (req, res) => {
  try {
    const {
      userRole,
      phoneNumber,
      location,
      userName,
      email,
      dealershipName,
      entityType,
      primaryContactPerson,
      primaryContactNumber,
      secondaryContactPerson,
      secondaryContactNumber,
      password,
      addressList,
      isStaff,
      permissions,
    } = req.body;

    if (!userRole || !userName || !email || !phoneNumber || !location || !password || !addressList) {
      return res.status(404).json({ message: 'Please fill all required fields.' });
    }

    if (userRole === CONSTANTS.USER_ROLES.DEALER) {
      if (!dealershipName || !entityType || !primaryContactPerson || !primaryContactNumber) {
        return res.status(404).json({ message: 'Missing required Dealer fields.' });
      }
    } else if (userRole === CONSTANTS.USER_ROLES.DEALER_AS_SELLER) {
      if (!dealershipName || !entityType || !primaryContactPerson || !primaryContactNumber) {
        return res.status(404).json({ message: 'Missing required Seller fields.' });
      }
    } else if (![
      CONSTANTS.USER_ROLES.ADMIN,
      CONSTANTS.USER_ROLES.CUSTOMER,
      CONSTANTS.USER_ROLES.INSPECTION_ENGINEER,
      CONSTANTS.USER_ROLES.SALES_MANAGER,
      CONSTANTS.USER_ROLES.RETAILER,
      CONSTANTS.USER_ROLES.TELECALLER,
      CONSTANTS.USER_ROLES.QC,
    ].includes(userRole)) {
      return res.status(404).json({ message: 'Invalid userRole provided.' });
    }

    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists.' });
    }

    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) {
      return res.status(400).json({ message: 'Phone Number already exists.' });
    }

    const user = new User({
      userRole,
      phoneNumber,
      location,
      userName,
      email,
      dealershipName,
      entityType,
      primaryContactPerson,
      primaryContactNumber,
      secondaryContactPerson: secondaryContactPerson || '',
      secondaryContactNumber: secondaryContactNumber || '',
      password,
      addressList,
      isStaff,
      permissions,
      // approvalStatus: CONSTANTS.APPROVAL_STATUS.PENDING
      approvalStatus: userRole === CONSTANTS.USER_ROLES.CUSTOMER
        ? CONSTANTS.APPROVAL_STATUS.APPROVED
        : CONSTANTS.APPROVAL_STATUS.PENDING
    });

    await user.save();

    // await sendEmail(
    //   email,
    //   'Welcome to Otobix!',
    //   `Dear ${userName},\n\nThank you for registering with Otobix.\nYour account is under review.\n\nBest regards,\nTeam Otobix`
    // );


    res.status(201).json({
      message: `${userRole} registered successfully!`,
      user
    });

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get All Users List
exports.getAllUsersList = async (req, res) => {
  try {
    const users = await User.find({
      userRole: { $ne: CONSTANTS.USER_ROLES.ADMIN }, // ✅ Exclude users with userRole = "admin"
    });

    res.status(200).json({
      success: true,
      message: 'All users fetched successfully.',
      users,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};


// Get Approved Users List
exports.getApprovedUsersList = async (req, res) => {
  try {
    const users = await User.find({
      approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED,
      userRole: { $ne: CONSTANTS.USER_ROLES.ADMIN }, // ✅ Exclude users with userRole = "admin"
    });

    const usersWithKam = await withKamNameForUsers(users);

    res.status(200).json({
      success: true,
      message: 'Approved users fetched successfully.',
      users: usersWithKam,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// Get Rejected Users List
exports.getRejectedUsersList = async (req, res) => {
  try {
    const users = await User.find({ approvalStatus: CONSTANTS.APPROVAL_STATUS.REJECTED });
    const usersWithKam = await withKamNameForUsers(users);

    res.status(200).json({
      success: true,
      message: 'Rejected users fetched successfully.',
      users: usersWithKam,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

// Get Pending Users List
exports.getPendingUsersList = async (req, res) => {
  try {
    const users = await User.find({ approvalStatus: CONSTANTS.APPROVAL_STATUS.PENDING });
    const usersWithKam = await withKamNameForUsers(users);

    res.status(200).json({
      success: true,
      message: 'Pending users fetched successfully.',
      users: usersWithKam,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};


// Get Users Length
exports.getUsersLength = async (req, res) => {
  try {
    const totalUsersLength = await User.countDocuments({
      userRole: { $ne: CONSTANTS.USER_ROLES.ADMIN },
    });

    const approvedUsersLength = await User.countDocuments({
      approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED,
      userRole: { $ne: CONSTANTS.USER_ROLES.ADMIN },
    });

    const rejectedUsersLength = await User.countDocuments({
      approvalStatus: CONSTANTS.APPROVAL_STATUS.REJECTED,
      userRole: { $ne: CONSTANTS.USER_ROLES.ADMIN },
    });

    const pendingUsersLength = await User.countDocuments({
      approvalStatus: CONSTANTS.APPROVAL_STATUS.PENDING,
      userRole: { $ne: CONSTANTS.USER_ROLES.ADMIN },
    });

    res.status(200).json({
      success: true,
      message: 'User status counts fetched successfully.',
      totalUsersLength,
      approvedUsersLength,
      rejectedUsersLength,
      pendingUsersLength,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};



exports.updateUserStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    const { approvalStatus, comment } = req.body;

    if (![CONSTANTS.APPROVAL_STATUS.APPROVED, CONSTANTS.APPROVAL_STATUS.REJECTED].includes(approvalStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid approval status. Must be Approved or Rejected.',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    user.approvalStatus = approvalStatus;
    user.rejectionComment = approvalStatus === CONSTANTS.APPROVAL_STATUS.REJECTED ? (comment || '') : '';

    await user.save();

    // Get approved users list
    const approvedUsersList = await User.find({
      approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED,
      userRole: { $ne: CONSTANTS.USER_ROLES.ADMIN }, // ✅ Exclude users with userRole = "admin"
    });

    // Get rejected users list
    const rejectedUsersList = await User.find({ approvalStatus: CONSTANTS.APPROVAL_STATUS.REJECTED });

    // Get pending users list
    const pendingUsersList = await User.find({ approvalStatus: CONSTANTS.APPROVAL_STATUS.PENDING });

    // Notify about user update
    SocketService.emitToRoom(
      EVENTS.ADMIN_HOME_ROOM,
      EVENTS.UPDATED_ADMIN_HOME_USERS,
      {
        approvedUsersList,
        rejectedUsersList,
        pendingUsersList
      }
    );


    return res.status(200).json({
      success: true,
      message: `User ${approvalStatus} successfully.`,
      user,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

exports.logout = async (req, res) => {
  try {
    const userId = req.params.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    user.token = null;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'User logged out successfully.',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

exports.getUserStatusById = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await User.findById(userId).select(
      'approvalStatus rejectionComment userName email'
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found.',
      });
    }

    res.status(200).json({
      success: true,
      message: 'User status fetched successfully.',
      user,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message,
    });
  }
};

exports.checkUsername = async (req, res) => {
  try {
    const { username } = req.query;

    if (!username || username.trim() === '') {
      return res.status(400).json({ message: 'Username is required.' });
    }

    const existingUser = await User.findOne({ userName: { $regex: `^${username}$`, $options: 'i' } });

    if (existingUser) {
      return res.status(200).json({ available: false, message: 'Username already exists.' });
    } else {
      return res.status(200).json({ available: true, message: 'Username is available.' });
    }

  } catch (error) {
    console.error('Check Username Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};


exports.getUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    let profile = {
      role: user.userRole,
      name: user.userName,
      email: user.email,
      phoneNumber: user.phoneNumber,
      image: user.image,
      location: user.location,
    };

    switch (user.userRole) {
      case CONSTANTS.USER_ROLES.DEALER:
      case CONSTANTS.USER_ROLES.DEALER_AS_SELLER:
        profile = {
          ...profile,
          dealershipName: user.dealershipName,
          entityType: user.entityType,
          primaryContactPerson: user.primaryContactPerson,
          primaryContactNumber: user.primaryContactNumber,
          secondaryContactPerson: user.secondaryContactPerson,
          secondaryContactNumber: user.secondaryContactNumber,
          addressList: user.addressList,
        };
        break;

      case CONSTANTS.USER_ROLES.CUSTOMER:
      case CONSTANTS.USER_ROLES.INSPECTION_ENGINEER:
      case CONSTANTS.USER_ROLES.SALES_MANAGER:
      case CONSTANTS.USER_ROLES.RETAILER:
      case CONSTANTS.USER_ROLES.TELECALLER:
      case CONSTANTS.USER_ROLES.QC:
        profile = {
          ...profile,
          addressList: user.addressList,
        };
        break;

      case CONSTANTS.USER_ROLES.ADMIN:
        profile = {
          ...profile,
          permissions: 'Full Access',
        };
        break;

      default:
        return res.status(400).json({ message: 'Invalid user role.' });
    }

    res.status(200).json({
      success: true,
      message: 'User profile fetched successfully.',
      profile,
    });

  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};


exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, phoneNumber, location } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.name = name;
    user.email = email;
    user.phoneNumber = phoneNumber;
    user.location = location;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User profile updated successfully.',
      user,
    });

  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateUserProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    const {
      userName,
      email,
      phoneNumber,
      location,
      dealershipName,
      entityType,
      primaryContactPerson,
      primaryContactNumber,
      secondaryContactPerson,
      secondaryContactNumber,
      addressList
    } = req.body;

    user.userName = userName || user.userName;
    user.email = email || user.email;
    user.phoneNumber = phoneNumber || user.phoneNumber;
    user.location = location || user.location;

    if (req.file) {
      const imageUrl = req.file.path;
      user.image = imageUrl;
    }

    switch (user.userRole) {
      case CONSTANTS.USER_ROLES.DEALER:
        user.dealershipName = dealershipName || user.dealershipName;
        user.entityType = entityType || user.entityType;
        user.primaryContactPerson = primaryContactPerson || user.primaryContactPerson;
        user.primaryContactNumber = primaryContactNumber || user.primaryContactNumber;
        user.secondaryContactPerson = secondaryContactPerson || user.secondaryContactPerson;
        user.secondaryContactNumber = secondaryContactNumber || user.secondaryContactNumber;
        if (addressList && Array.isArray(addressList)) {
          user.addressList = addressList;
        }
        break;

      case CONSTANTS.USER_ROLES.SALES_MANAGER:
      case CONSTANTS.USER_ROLES.CUSTOMER:
        if (addressList && Array.isArray(addressList)) {
          user.addressList = addressList;
        }
        break;

      case CONSTANTS.USER_ROLES.ADMIN:
        // No extra fields for admin
        break;

      default:
        return res.status(400).json({ message: 'Invalid user role.' });
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'User profile updated successfully.',
      user,
    });

  } catch (error) {
    console.error('Update Profile Error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};



exports.updateUserThroughAdmin = async (req, res) => {
  try {
    const { userId } = req.query;
    const {
      // password,
      approvalStatus } = req.body;

    const updateFields = {};

    // if (password) {
    //   updateFields.password = password;
    // }

    if (approvalStatus) {
      updateFields.approvalStatus = approvalStatus;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: 'No fields provided for update.' });
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateFields, {
      new: true,
      runValidators: true,
    });

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Get approved users list
    const approvedUsersList = await User.find({
      approvalStatus: CONSTANTS.APPROVAL_STATUS.APPROVED,
      userRole: { $ne: CONSTANTS.USER_ROLES.ADMIN }, // ✅ Exclude users with userRole = "admin"
    });

    // Get rejected users list
    const rejectedUsersList = await User.find({ approvalStatus: CONSTANTS.APPROVAL_STATUS.REJECTED });

    // Get pending users list
    const pendingUsersList = await User.find({ approvalStatus: CONSTANTS.APPROVAL_STATUS.PENDING });

    // Notify about user update
    SocketService.emitToRoom(
      EVENTS.ADMIN_HOME_ROOM,
      EVENTS.UPDATED_ADMIN_HOME_USERS,
      {
        approvedUsersList,
        rejectedUsersList,
        pendingUsersList
      }
    );


    res.status(200).json({
      message: 'User updated successfully.',
      user: updatedUser,
    });

  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ message: 'Server error.' });
  }
};


// Update Password By Phone Number
exports.setNewPassword = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    if (!phoneNumber || !password) {
      return res.status(400).json({ message: 'phoneNumber and password are required.' });
    }

    // Optional basic hygiene
    const phone = String(phoneNumber).trim();
    const newPassword = String(password);

    // This triggers your pre('findOneAndUpdate') hook which hashes the password
    const user = await User.findOneAndUpdate(
      { phoneNumber: phone },
      { $set: { password: newPassword } },
      {
        new: false,           // we don't need the updated doc returned
        runValidators: true,
        context: 'query',     // keeps validators/hooks happy
      }
    );

    if (!user) {
      return res.status(404).json({ message: 'User with this phone number was not found.' });
    }

    return res.status(200).json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('setPasswordByPhone error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};



// ----------- Create user through Admin -----------
exports.createUserThroughAdmin = async (req, res) => {
  try {
    const {
      userRole,
      phoneNumber,
      location,
      userName,
      email,
      primaryContactPerson,
      primaryContactNumber,
      secondaryContactPerson,
      secondaryContactNumber,
      password,
      addressList,
      approvalStatus,
      assignedKam,
      isStaff,

      // Dealer fields
      dealershipName,
      entityType,
    } = req.body;

    if (!userRole || !phoneNumber || !location || !userName || !email || !password || !addressList) {
      return res.status(400).json({ message: 'Please fill all required fields ( userRole, phoneNumber, location, userName, email, password addressList ).' });
    }

    if (userRole === CONSTANTS.USER_ROLES.DEALER) {
      if (!dealershipName || !entityType || !primaryContactPerson || !primaryContactNumber) {
        return res.status(400).json({ message: 'Please fill all required fields for dealer ( dealershipName, entityType primaryContactPerson primaryContactNumber ).' });
      }
    }

    if (!Array.isArray(addressList) || addressList.length === 0) {
      return res.status(400).json({ message: 'addressList must be a non-empty array.' });
    }


    // If userName already exists in database
    const existingUserName = await User.findOne({ userName });
    if (existingUserName) {
      return res.status(400).json({ message: 'User Name already exists.' });
    }

    // If email already exists in database
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.status(400).json({ message: 'Email already exists.' });
    }

    // If phoneNumber already exists in database
    const existingPhone = await User.findOne({ phoneNumber });
    if (existingPhone) {
      return res.status(400).json({ message: 'Phone Number already exists.' });
    }

    const user = new User({
      userRole,
      phoneNumber,
      location: location || '',
      userName,
      email,
      dealershipName: dealershipName || '',
      image: '',
      entityType: entityType || '',
      primaryContactPerson: primaryContactPerson || '',
      primaryContactNumber: primaryContactNumber || '',
      secondaryContactPerson: secondaryContactPerson || '',
      secondaryContactNumber: secondaryContactNumber || '',
      password,
      addressList: addressList || [],
      approvalStatus: approvalStatus || CONSTANTS.APPROVAL_STATUS.APPROVED,
      rejectionComment: '',
      wishlist: [],
      myBids: [],
      purchasedCars: [],
      assignedKam: assignedKam || '',
      isStaff: isStaff ?? true,
      permissions: [],
    });

    await user.save();

    // await sendEmail(
    //   email,
    //   'Welcome to Otobix!',
    //   `Dear ${userName},\n\nYour OtoBix account has been created.\n\nBest regards,\nTeam Otobix`
    // );


    res.status(200).json({
      message: `User created successfully!`,
      user
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
