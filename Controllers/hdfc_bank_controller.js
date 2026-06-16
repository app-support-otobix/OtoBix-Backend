// Controller/hdfc_bank_controller.js

const axios = require('axios');

const BASE_URL = 'http://13.205.53.23:3000';

// common handler
const callApi = async (url, body) => {
    try {
        const response = await axios.post(url, body, {
            headers: { 'Content-Type': 'application/json' }
        });

        return response.data;

    } catch (error) {
        // Throw actual API error forward
        throw {
            status: error?.response?.status,
            data: error?.response?.data,
            message: error?.message
        };
    }
};

// ======================= 1. Generate OTP =======================
exports.generateOtp = async (req, res) => {
    try {
        const data = await callApi(`${BASE_URL}/generate-otp`, req.body);

        return res.status(200).json(data);
    } catch (error) {
        console.error('generateOtp error:', error);
        return res.status(error?.status || 500).json({
            success: false,
            message: error?.data || error?.message || 'Internal Server Error',
        });
    }
};

// ======================= 2. Check Eligibility =======================
exports.checkEligibility = async (req, res) => {
    try {
        const data = await callApi(`${BASE_URL}/check-eligibility`, req.body);
        return res.status(200).json(data);
    } catch (error) {
        console.error('checkEligibility error:', error);
        return res.status(error?.status || 500).json({
            success: false,
            message: error?.data || error?.message || 'Internal Server Error',
        });
    }
};

// ======================= 3. Fetch Offer =======================
exports.fetchOffer = async (req, res) => {
    try {
        const data = await callApi(`${BASE_URL}/fetch-offer`, req.body);
        return res.status(200).json(data);
    } catch (error) {
        console.error('fetchOffer error:', error);
        return res.status(error?.status || 500).json({
            success: false,
            message: error?.data || error?.message || 'Internal Server Error',
        });
    }
};

// ======================= 4. Check Loan Status =======================
exports.checkLoanStatus = async (req, res) => {
    try {
        const data = await callApi(`${BASE_URL}/check-loan-status`, req.body);
        return res.status(200).json(data);
    } catch (error) {
        console.error('checkLoanStatus error:', error);
        return res.status(error?.status || 500).json({
            success: false,
            message: error?.data || error?.message || 'Internal Server Error',
        });
    }
};

// ======================= 5. Master Data =======================
exports.masterData = async (req, res) => {
    try {
        const data = await callApi(`${BASE_URL}/master-data`, req.body);
        return res.status(200).json(data);
    } catch (error) {
        console.error('masterData error:', error);
        return res.status(error?.status || 500).json({
            success: false,
            message: error?.data || error?.message || 'Internal Server Error',
        });
    }
};

// ======================= 6. Apply Loan =======================
exports.applyLoan = async (req, res) => {
    try {
        const data = await callApi(`${BASE_URL}/apply-loan`, req.body);
        return res.status(200).json(data);
    } catch (error) {
        console.error('applyLoan error:', error);
        return res.status(error?.status || 500).json({
            success: false,
            message: error?.data || error?.message || 'Internal Server Error',
        });
    }
};

// ======================= 7. Update Loan =======================
exports.updateLoan = async (req, res) => {
    try {
        const data = await callApi(`${BASE_URL}/update-loan`, req.body);
        return res.status(200).json(data);
    } catch (error) {
        console.error('updateLoan error:', error);
        return res.status(error?.status || 500).json({
            success: false,
            message: error?.data || error?.message || 'Internal Server Error',
        });
    }
};

// ======================= 8. Get Redirection Token =======================
exports.getRedirectionToken = async (req, res) => {
    try {
        const data = await callApi(`${BASE_URL}/get-redirection-token`, req.body);
        return res.status(200).json(data);
    } catch (error) {
        console.error('getRedirectionToken error:', error);
        return res.status(error?.status || 500).json({
            success: false,
            message: error?.data || error?.message || 'Internal Server Error',
        });
    }
};

// ======================= 9. Document Download =======================
exports.documentDownload = async (req, res) => {
    try {
        const data = await callApi(`${BASE_URL}/document-download`, req.body);
        return res.status(200).json(data);
    } catch (error) {
        console.error('documentDownload error:', error);
        return res.status(error?.status || 500).json({
            success: false,
            message: error?.data || error?.message || 'Internal Server Error',
        });
    }
};

// ======================= 10. Fetch MIS Status =======================
exports.fetchMisStatus = async (req, res) => {
    try {
        const data = await callApi(`${BASE_URL}/status-mis`, req.body);
        return res.status(200).json(data);
    } catch (error) {
        console.error('fetchMisStatus error:', error);
        return res.status(error?.status || 500).json({
            success: false,
            message: error?.data || error?.message || 'Internal Server Error',
        });
    }
};