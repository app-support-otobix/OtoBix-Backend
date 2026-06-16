// Routes/hdfc_bank_routes.js

const express = require('express');
const router = express.Router();

const otobixAuthMiddleware = require("../Middlewares/otobix_auth_middleware");

const {
    generateOtp,
    checkEligibility,
    fetchOffer,
    checkLoanStatus,
    masterData,
    applyLoan,
    updateLoan,
    getRedirectionToken,
    documentDownload,
    fetchMisStatus
} = require('../Controllers/hdfc_bank_controller');


// Everything below this line is protected by Otobix token middleware
router.use(otobixAuthMiddleware);


// ======================= HDFC Bank Routes =======================
router.post('/generate-otp', generateOtp);
router.post('/check-eligibility', checkEligibility);
router.post('/fetch-offer', fetchOffer);
router.post('/check-loan-status', checkLoanStatus);
router.post('/master-data', masterData);
router.post('/apply-loan', applyLoan);
router.post('/update-loan', updateLoan);
router.post('/get-redirection-token', getRedirectionToken);
router.post('/document-download', documentDownload);
router.post('/status-mis', fetchMisStatus);


// Export the router
module.exports = router;