// Middlewares/auth_middleware.js  
const jwt = require('jsonwebtoken');
const User = require('../Models/userModel');
const CONSTANTS = require('../Utils/constants');

module.exports = async (req, res, next) => {
  const raw = req.headers.authorization || '';
  const [scheme, token] = raw.split(' ');

  if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
    return res.status(401).json({
      code: 'TOKEN_MISSING',
      message: 'Authorization token is missing',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    // Optional: ensure user still exists (and is approved, etc.)
    const user = await User.findById(decoded.id).select('_id userRole approvalStatus').lean();
    if (!user) {
      return res.status(401).json({
        code: 'USER_NOT_FOUND',
        message: 'Account no longer exists',
      });
    }

    // Optional: approval gate
    if (user.approvalStatus !== CONSTANTS.APPROVAL_STATUS.APPROVED) {
      return res.status(403).json({ code: 'USER_NOT_APPROVED', message: 'Approval pending' });
    }

    req.user = { id: user._id, role: user.userRole };
    next();
  } catch (err) {
    return res.status(401).json({
      code: err?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      message: 'Invalid or expired token',
    });
  }
};

