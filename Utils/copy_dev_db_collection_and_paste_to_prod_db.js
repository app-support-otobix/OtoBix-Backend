// // Utils/copy_dev_db_collection_and_paste_to_prod_db.js
// "use strict";

// const { MongoClient } = require("mongodb");

// function requireApiKey(req, res, next) {
//     const apiKey = req.body?.apiKey; // <-- from body
//     if (!apiKey || apiKey !== process.env.SYNC_API_KEY) {
//         return res.status(401).json({ error: "Unauthorized" });
//     }
//     next();
// }


// function isAllowedCollection(name) {
//     if (!name || typeof name !== "string") return false;
//     if (name.includes("\0") || name.includes("$") || name.startsWith("system.")) return false;

//     const allowList = (process.env.SYNC_ALLOWED_COLLECTIONS || "")
//         .split(",")
//         .map((s) => s.trim())
//         .filter(Boolean);

//     if (allowList.length > 0) return allowList.includes(name);
//     return true;
// }

// async function ensureCollectionExists(db, collectionName) {
//     const exists = await db.listCollections({ name: collectionName }).hasNext();
//     if (!exists) await db.createCollection(collectionName);
// }

// async function ensureIndexesFromDev(devCol, prodCol) {
//     const devIndexes = await devCol.indexes();
//     const prodIndexes = await prodCol.indexes();
//     const prodIndexNames = new Set(prodIndexes.map((i) => i.name));

//     const toCreate = devIndexes
//         .filter((ix) => ix.name !== "_id_")
//         .map((ix) => {
//             const { key, name, ...options } = ix;
//             return { key, name, ...options };
//         })
//         .filter((ix) => !prodIndexNames.has(ix.name));

//     if (toCreate.length > 0) {
//         await prodCol.createIndexes(toCreate);
//     }
// }

// async function upsertCollection({
//     devUri,
//     devDbName,
//     prodUri,
//     prodDbName,
//     collectionName,
//     batchSize = 1000,
// }) {
//     const devClient = new MongoClient(devUri);
//     const prodClient = new MongoClient(prodUri);

//     await devClient.connect();
//     await prodClient.connect();

//     try {
//         const devDb = devClient.db(devDbName);
//         const prodDb = prodClient.db(prodDbName);

//         const devExists = await devDb.listCollections({ name: collectionName }).hasNext();
//         if (!devExists) throw new Error(`DEV collection "${collectionName}" does not exist`);

//         await ensureCollectionExists(prodDb, collectionName);

//         const devCol = devDb.collection(collectionName);
//         const prodCol = prodDb.collection(collectionName);

//         await ensureIndexesFromDev(devCol, prodCol);

//         const cursor = devCol.find({}, { batchSize });

//         let processed = 0;
//         let ops = [];

//         while (await cursor.hasNext()) {
//             const doc = await cursor.next();

//             ops.push({
//                 replaceOne: {
//                     filter: { _id: doc._id },
//                     replacement: doc,
//                     upsert: true,
//                 },
//             });

//             if (ops.length >= batchSize) {
//                 await prodCol.bulkWrite(ops, { ordered: false });
//                 processed += ops.length;
//                 ops = [];
//             }
//         }

//         if (ops.length > 0) {
//             await prodCol.bulkWrite(ops, { ordered: false });
//             processed += ops.length;
//         }

//         return { ok: true, collectionName, mode: "upsert", upsertedDocs: processed };
//     } finally {
//         await devClient.close();
//         await prodClient.close();
//     }
// }

// // ✅ This is what your router should call
// async function copyDevDbCollectionAndPasteToProdDb(req, res) {
//     try {
//         const { collectionName } = req.body;

//         if (!isAllowedCollection(collectionName)) {
//             return res.status(400).json({ error: "Invalid or not-allowed collectionName" });
//         }

//         const devUri = process.env.DEV_MONGO_URI;
//         const devDbName = process.env.DEV_DB_NAME;
//         const prodUri = process.env.PROD_MONGO_URI;
//         const prodDbName = process.env.PROD_DB_NAME;

//         if (!devUri || !devDbName || !prodUri || !prodDbName) {
//             return res.status(500).json({ error: "Missing required DB env variables" });
//         }

//         const result = await upsertCollection({
//             devUri,
//             devDbName,
//             prodUri,
//             prodDbName,
//             collectionName,
//         });

//         return res.json({ success: true, ...result });
//     } catch (err) {
//         console.error("copyDevDbCollectionAndPasteToProdDb error:", err);
//         return res.status(500).json({ error: err.message || "Server error" });
//     }
// }

// module.exports = {
//     requireApiKey, // ✅ you can use as middleware in route
//     copyDevDbCollectionAndPasteToProdDb,
// };
