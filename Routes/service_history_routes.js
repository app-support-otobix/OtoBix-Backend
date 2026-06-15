// routes/service_history_routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { fetchSampleServiceHistoryPdf, fetchServiceHistory, fetchServiceHistoryReportsList, submitServiceHistoryRequest } = require('../Controllers/service_history_controller');

// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);

// Service History Routes
router.get('/fetch-sample-pdf', fetchSampleServiceHistoryPdf);
router.get('/fetch-details', fetchServiceHistory);
router.get('/fetch-reports-list', fetchServiceHistoryReportsList);
router.post('/submit-request', submitServiceHistoryRequest);

// Export the router
module.exports = router;
