// Middlewares/otobix_auth_middleware.js
require("dotenv").config();

module.exports = (req, res, next) => {
    try {
        const otobixAccessToken = process.env.OTOBIX_ACCESS_TOKEN;

        if (!otobixAccessToken) {
            return res.status(500).json({
                success: false,
                message: "OTOBIX_ACCESS_TOKEN is not configured in .env",
            });
        }

        // Support both:
        // 1. custom header: token: <value> // mostly used in otobix routes
        // 2. Authorization: Bearer <value>
        const tokenFromCustomHeader = req.headers["token"];
        const authHeader = req.headers["authorization"];

        let receivedToken = tokenFromCustomHeader;

        if (!receivedToken && authHeader) {
            const parts = authHeader.split(" ");
            if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
                receivedToken = parts[1];
            }
        }

        if (!receivedToken || String(receivedToken).trim() !== String(otobixAccessToken).trim()) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized (invalid token)",
            });
        }

        next();
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Authentication otobix middleware error",
            error: error.message,
        });
    }
};