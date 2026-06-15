


// Extra Files/self_ping.js
const axios = require('axios');

// Ping route handler
exports.ping = (req, res) => {
    console.log(`[PingController] Ping received at ${new Date().toISOString()}`);
    res.send('pong');
};

// Auto-ping functionality to be executed at regular intervals
exports.autoPing = (autoPingUrl) => {
    setInterval(async () => {
        try {
            // Perform the auto ping with the provided URL
            await axios.get(autoPingUrl);
            console.log(`[AutoPing] Successful at ${new Date().toISOString()}`);
        } catch (err) {
            console.error('[AutoPing] Failed:', err.message);
        }
    }, 10 * 60 * 1000); // Ping every 10 minutes
};
