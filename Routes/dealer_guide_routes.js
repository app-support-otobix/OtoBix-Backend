// routes/dealer_guide_routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { uploadMiddleware, uploadDealerGuide, getLatestDealerGuide, getDealerGuideByVersion, listDealerGuide } = require('../Controllers/dealer_guide_controller');


// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);

// Upload: form-data => file=<docx/pdf>, title=<optional>
router.post('/upload', uploadMiddleware, uploadDealerGuide);

router.get('/latest', getLatestDealerGuide);
router.get('/:version', getDealerGuideByVersion);
router.get('/', listDealerGuide);

module.exports = router;
