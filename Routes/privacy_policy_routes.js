// routes/privacy_policy_routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { uploadMiddleware, uploadPrivacyPolicy, getLatestPrivacyPolicy, getPrivacyPolicyByVersion, listPrivacyPolicy } = require('../Controllers/privacy_policy_controller');


// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);

// Upload: form-data => file=<docx/pdf>, title=<optional>
router.post('/upload', uploadMiddleware, uploadPrivacyPolicy);

router.get('/latest', getLatestPrivacyPolicy);
router.get('/:version', getPrivacyPolicyByVersion);
router.get('/', listPrivacyPolicy);

module.exports = router;
