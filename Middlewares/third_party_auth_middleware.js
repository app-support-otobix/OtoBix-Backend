// Middlewares/third_party_auth_middleware.js
require("dotenv").config();

module.exports = (req, res, next) => {
    try {
        const thirdPartyAccessToken = process.env.THIRD_PARTY_ACCESS_TOKEN;

        if (!thirdPartyAccessToken) {
            return res.status(500).json({
                success: false,
                message: "THIRD_PARTY_ACCESS_TOKEN is not configured in .env",
            });
        }

        // Support both:
        // 1. custom header: token: <value> // mostly used in third party routes
        // 2. Authorization: Bearer <value>
        const tokenFromCustomHeader = req.headers["token"];
        const tokenFromApiKey = req.headers["x-api-key"];
        const authHeader = req.headers["authorization"];

        let receivedToken = tokenFromCustomHeader || tokenFromApiKey;

        if (!receivedToken && authHeader) {
            const parts = authHeader.split(" ");
            if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
                receivedToken = parts[1];
            }
        }

        if (!receivedToken || String(receivedToken).trim() !== String(thirdPartyAccessToken).trim()) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized (invalid token)",
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Authentication tp middleware error",
            error: error.message,
        });
    }
};