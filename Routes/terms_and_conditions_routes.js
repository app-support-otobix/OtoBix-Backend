// routes/terms.routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { uploadMiddleware, uploadTerms, getLatestTerms, getTermsByVersion, listTerms } = require('../Controllers/terms_and_conditions_controller');

// Public routes
router.get('/:version', getTermsByVersion);
router.get('/', listTerms);
router.get('/latest', getLatestTerms);

// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);


// Upload: form-data => file=<docx/pdf>, title=<optional>
router.post('/upload', uploadMiddleware, uploadTerms);


module.exports = router;
