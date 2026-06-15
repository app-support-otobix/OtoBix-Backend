
// Helper Functions/send_notification_helpers.js
require('dotenv').config();
const axios = require('axios');
const UserModel = require('../Models/userModel');
const CONSTANTS = require('../Utils/constants');

// --------- OneSignal client cache (so we don't recreate axios every time) ---------
const oneSignalClients = {}; // { apiKey: axiosInstance }

function getOneSignalClient(apiKey) {
    if (!apiKey) throw new Error('Missing OneSignal API Key for this target app.');
    if (!oneSignalClients[apiKey]) {
        oneSignalClients[apiKey] = axios.create({
            baseURL: 'https://api.onesignal.com',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Key ${apiKey}`,
            },
            timeout: 10000,
        });
    }
    return oneSignalClients[apiKey];
}

// --------- Resolve OneSignal App config by userRole (AUTO) ---------
function resolveOneSignalConfigByRole(userRole) {
    if (userRole === CONSTANTS.USER_ROLES.DEALER) {
        return {
            appId: process.env.ONESIGNAL_DEALER_APP_ID,
            apiKey: process.env.ONESIGNAL_DEALER_API_KEY,
        };
    }

    if (userRole === CONSTANTS.USER_ROLES.CUSTOMER) {
        return {
            appId: process.env.ONESIGNAL_CUSTOMER_APP_ID,
            apiKey: process.env.ONESIGNAL_CUSTOMER_API_KEY,
        };
    }

    if (userRole === CONSTANTS.USER_ROLES.INSPECTION_ENGINEER) {
        return {
            appId: process.env.ONESIGNAL_INSPECTION_APP_ID,
            apiKey: process.env.ONESIGNAL_INSPECTION_API_KEY,
        };
    }

    // fallback (default dealer app config)
    return {
        appId: process.env.ONESIGNAL_APP_ID,
        apiKey: process.env.ONESIGNAL_API_KEY,
    };
}

async function getUserRoleByUserId(userId) {
    // IMPORTANT: userId here should be your mongo user id (same one you pass to OneSignal.login)
    const user = await UserModel.findById(userId).select('userRole').lean();

    if (!user) {
        throw new Error(`User not found for id=${userId}`);
    }
    return user.userRole;
}

// --------- Send push notification to a specific user (AUTO selects app) ---------
async function sendPushToExternalId({ externalId, title, body, data, androidChannelId }) {
    // externalId here = mongo user id
    const envPrefix = process.env.DEPLOYMENT_ENVIRONMENT; // dev|prod|local
    const externalIdWithEnvPrefix = `${envPrefix}:${externalId}`;

    const userRole = await getUserRoleByUserId(externalId);
    const { appId, apiKey } = resolveOneSignalConfigByRole(userRole);
    const oneSignal = getOneSignalClient(apiKey);

    const payload = {
        app_id: appId,
        target_channel: 'push',
        include_aliases: { external_id: [externalIdWithEnvPrefix] },
        headings: title ? { en: title } : undefined,
        contents: { en: body },
        data,
        small_icon: 'notificationIcon',
        // android_channel_id: androidChannelId,
    };

    try {
        const { data: resp, status } = await oneSignal.post('/notifications', payload);
        console.log(`[OneSignal] role=${userRole} status=${status}`, { payload, response: resp });
        return resp;
    } catch (e) {
        console.error(
            `[OneSignal] role=${userRole} ERROR`, { status: e?.response?.status, error: e?.response?.data || e.message, payload });
        // throw e;
        return null;
    }
}



// If you truly want "all users across BOTH apps", you must call both:
async function sendPushToAllUsers({ title, body, data }) {
    const results = await Promise.allSettled([
        sendPushToAllDealers({ title, body, data }),
        sendPushToAllCustomers({ title, body, data }),
        sendPushToAllInspectionEngineers({ title, body, data }),
    ]);

    // optional: log failures
    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            console.error(`[OneSignal] Broadcast ${i === 0 ? 'dealers' : i === 1 ? 'customers' : i === 2 ? 'inspection engineers' : 'unknown'} failed:`, r.reason?.message || r.reason);
        }
    });

    return results;
}


// --------- Broadcast helpers (per app) ---------
// Dealer App - Broadcast to all users
async function sendPushToAllDealers({ title, body, data }) {
    const envTag = process.env.DEPLOYMENT_ENVIRONMENT;

    const appId = process.env.ONESIGNAL_DEALER_APP_ID;
    const apiKey = process.env.ONESIGNAL_DEALER_API_KEY;
    const oneSignal = getOneSignalClient(apiKey);

    const payload = {
        app_id: appId,
        filters: [{ field: 'tag', key: 'env', relation: '=', value: envTag }],
        headings: title ? { en: title } : undefined,
        contents: { en: body },
        data,
        small_icon: 'notificationIcon',
    };

    try {
        const { data: resp, status } = await oneSignal.post('/notifications', payload);
        console.log(`[OneSignal] Broadcast dealers env=${envTag} → ${status}`, { payload, response: resp });
        return resp;
    } catch (e) {
        console.error(`[OneSignal] Broadcast dealers error env=${envTag}:`, { status: e?.response?.status, error: e?.response?.data || e.message, payload });
        // throw e;
        return null;
    }
}

// Customer App - Broadcast to all users
async function sendPushToAllCustomers({ title, body, data }) {
    const envTag = process.env.DEPLOYMENT_ENVIRONMENT;

    const appId = process.env.ONESIGNAL_CUSTOMER_APP_ID;
    const apiKey = process.env.ONESIGNAL_CUSTOMER_API_KEY;
    const oneSignal = getOneSignalClient(apiKey);

    const payload = {
        app_id: appId,
        filters: [{ field: 'tag', key: 'env', relation: '=', value: envTag }],
        headings: title ? { en: title } : undefined,
        contents: { en: body },
        data,
        small_icon: 'notificationIcon',
    };

    try {
        const { data: resp, status } = await oneSignal.post('/notifications', payload);
        console.log(`[OneSignal] Broadcast customers env=${envTag} → ${status}`, { payload, response: resp });
        return resp;
    } catch (e) {
        console.error(`[OneSignal] Broadcast customers error env=${envTag}:`, { status: e?.response?.status, error: e?.response?.data || e.message, payload });
        // throw e;
        return null;
    }
}


// Inspection App - Broadcast to all users
async function sendPushToAllInspectionEngineers({ title, body, data }) {
    const envTag = process.env.DEPLOYMENT_ENVIRONMENT;

    const appId = process.env.ONESIGNAL_INSPECTION_APP_ID;
    const apiKey = process.env.ONESIGNAL_INSPECTION_API_KEY;
    const oneSignal = getOneSignalClient(apiKey);

    const payload = {
        app_id: appId,
        filters: [{ field: 'tag', key: 'env', relation: '=', value: envTag }],
        headings: title ? { en: title } : undefined,
        contents: { en: body },
        data,
        small_icon: 'notificationIcon',
    };

    try {
        const { data: resp, status } = await oneSignal.post('/notifications', payload);
        console.log(`[OneSignal] Broadcast customers env=${envTag} → ${status}`, { payload, response: resp });
        return resp;
    } catch (e) {
        console.error(`[OneSignal] Broadcast customers error env=${envTag}:`, { status: e?.response?.status, error: e?.response?.data || e.message, payload });
        // throw e;
        return null;
    }
}



module.exports = {
    sendPushToExternalId,
    sendPushToAllUsers,
    sendPushToAllDealers,
    sendPushToAllCustomers,
    sendPushToAllInspectionEngineers,
};











// // Helper Functions/send_notification_helpers.js
// require('dotenv').config();
// const oneSignal = require('../Config/notification_service');

// // Send push notification to a specific user
// async function sendPushToExternalId({ externalId, title, body, data, androidChannelId }) {

//     const externalIdWithDeploymentEnvironmentPrefix = `${process.env.DEPLOYMENT_ENVIRONMENT}:${externalId}`; // "dev:<id>" or "prod:<id>"

//     const payload = {
//         app_id: process.env.ONESIGNAL_APP_ID,
//         target_channel: 'push',
//         include_aliases: { external_id: [externalIdWithDeploymentEnvironmentPrefix] }, // MUST match OneSignal.login(externalId) on the device
//         headings: title ? { en: title } : undefined,
//         contents: { en: body },
//         data, // arrives in app as additionalData
//         small_icon: 'notificationIcon'
//         // Optional but recommended on Android if you want to guarantee sound:
//         // android_channel_id: androidChannelId, // channel with sound ON (if you created one)
//         // On iOS, default sound plays automatically; no need to set ios_sound
//     };


//     try {
//         const { data: resp, status } = await oneSignal.post('/notifications', payload);
//         console.log('[OneSignal RESP]', status, JSON.stringify(resp));
//         return resp;
//     } catch (e) {
//         console.error('[OneSignal ERROR]', e?.response?.status, e?.response?.data || e.message);
//         throw e;
//     }
// }


// // Send push notification to all users
// async function sendPushToAllUsers({ title, body, data }) {
//     const envTag = process.env.DEPLOYMENT_ENVIRONMENT; // e.g., 'local', 'dev', 'prod'

//     const payload = {
//         app_id: process.env.ONESIGNAL_APP_ID,
//         filters: [
//             { field: 'tag', key: 'env', relation: '=', value: envTag },
//         ],
//         headings: title ? { en: title } : undefined,
//         contents: { en: body },
//         data,
//         small_icon: 'notificationIcon',
//     };

//     try {
//         const { data: resp, status } = await oneSignal.post('/notifications', payload);
//         console.log(`[OneSignal] Broadcast to env=${envTag} → ${status}`, JSON.stringify(resp));
//         return resp;
//     } catch (e) {
//         console.error(`[OneSignal] Broadcast error for env=${envTag}:`, e?.response?.data || e.message);
//         throw e;
//     }
// }


// module.exports = { sendPushToExternalId, sendPushToAllUsers };

