// Config/firebase_service.js
const admin = require("firebase-admin");
require("dotenv").config();

// Option A: load JSON file directly (dev/local)
// const serviceAccount = require("../serviceAccountKey.json");

// Option B (recommended): use env var that contains the JSON string
// process.env.FIREBASE_SERVICE_ACCOUNT_KEY_FOR_WHATSAPP_CATALOG = '{"type":"service_account",...}'
let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY_FOR_WHATSAPP_CATALOG) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY_FOR_WHATSAPP_CATALOG);
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: serviceAccount
            ? admin.credential.cert(serviceAccount)
            : admin.credential.applicationDefault(),
    });
}

const db = admin.firestore();

module.exports = { admin, db };





// // Config/firebase_service.js
// const admin = require('firebase-admin');

// class FirebaseService {
//     constructor() {
//         this._initialized = false;
//     }

//     init() {
//         if (this._initialized) return;

//         const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
//         if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing in .env');

//         let credentials;
//         try {
//             credentials = JSON.parse(raw); // stringified JSON in .env
//         } catch (e) {
//             throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON');
//         }

//         // Handle escaped newlines in private_key (common in .env)
//         if (credentials.private_key && credentials.private_key.includes('\\n')) {
//             credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
//         }

//         admin.initializeApp({
//             credential: admin.credential.cert(credentials),
//         });

//         this._initialized = true;
//         console.log('[Firebase] ✅ Initialized successfully');
//     }

//     messaging() {
//         if (!this._initialized) {
//             throw new Error('Firebase not initialized. Call FirebaseService.init() first.');
//         }
//         return admin.messaging();
//     }
// }

// // helper kept in same file
// function toStringMap(obj = {}) {
//     return Object.fromEntries(
//         Object.entries(obj).map(([k, v]) => [String(k), String(v)])
//     );
// }

// // 👇 Export BOTH from the same file (no overwriting)
// const firebaseService = new FirebaseService();
// module.exports = {
//     firebaseService,
//     toStringMap,
// };
