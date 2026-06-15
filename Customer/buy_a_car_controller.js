// Customer/buy_a_car_controller.js
const { admin, db } = require('../Config/firebase_service');
const InterestedBuyersModel = require('../Models/interestedBuyersModel');
require("dotenv").config();


// ------------------ Helpers ------------------
const str = (v) => (v === undefined || v === null ? "" : String(v));
const bool = (v) => (typeof v === "boolean" ? v : false);

const toDateOrNull = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v === "string") {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
    }
    return null;
};

const normalizeImages = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr
        .filter((x) => x && typeof x === "object")
        .map((x) => ({
            path: str(x.path),
            status: bool(x.status),
            url: str(x.url),
        }));
};

const mapCarDoc = (doc) => {
    const d = doc.data() || {};
    return {
        dealerDocId: str(d.dealerDocId),
        dealerPhoneNumber: str(d.dealerPhoneNumber),
        dealerRole: str(d.dealerRole),
        dealerCity: str(d.dealerCity),
        dealerName: str(d.dealerName),
        dealerAssignedPhone: str(d.dealerAssignedPhone),
        dealerState: str(d.dealerState),
        dealerUserId: str(d.dealerUserId),
        dealerEmail: str(d.dealerEmail),
        dealerUserName: str(d.dealerUserName),

        carDocId: doc.id,
        carContact: str(d.carContact),
        carName: str(d.carName),
        carDesc: str(d.carDesc),
        carPrice: str(d.carPrice),
        carYear: str(d.carYear),
        carTaxValidity: str(d.carTaxValidity),
        carOwnershipSerialNo: str(d.carOwnershipSerialNo),
        carMake: str(d.carMake),
        carModel: str(d.carModel),
        carVariant: str(d.carVariant),
        carKms: str(d.carKms),
        carTransmission: str(d.carTransmission),
        carFuelType: str(d.carFuelType),
        carBodyType: str(d.carBodyType),
        carImageUrls: normalizeImages(d.carImageUrls),

        isDeleted: bool(d.isDeleted),
        scrapedAt: toDateOrNull(d.scrapedAt),
        uploadedAt: toDateOrNull(d.uploadedAt),

        activityType: str(d.activityType) || "interested",
        interestedBuyerId: str(d.interestedBuyerId),
    };
};





// ======================= SEARCH CARS (NO EXTRA FIELD REQUIRED) =======================
// Behavior:
// - If body.limit is provided -> returns up to limit (capped at 50)
// - If body.limit is NOT provided -> returns all matches (up to MAX_SCAN_DOCS scan safety)
exports.searchCarsForBuyACar = async (req, res) => {
    try {


        console.log("SEARCH body:", req.body);
        console.log("SEARCH limit raw:", req.body?.limit, "type:", typeof req.body?.limit);
        console.log("SEARCH querystring:", req.query);
        const qRaw = str(req.body?.q).trim();
        const q = qRaw.toLowerCase();

        // ✅ limit is OPTIONAL
        const limitRaw = req.body?.limit;
        const limit =
            limitRaw === undefined || limitRaw === null || String(limitRaw).trim() === ""
                ? null
                : Math.min(parseInt(limitRaw, 10), 50);

        // optional cursor (future pagination if you want)
        const cursorDocId = str(req.body?.cursorDocId).trim();

        if (!q) {
            return res.status(200).json({
                success: true,
                mode: "search",
                query: qRaw,
                scannedDocs: 0,
                count: 0,
                carsList: [],
                nextCursorDocId: null,
                hasMore: false,
            });
        }

        const CHUNK_SIZE = 200;     // how many docs per Firestore fetch
        const MAX_SCAN_DOCS = 1500; // server protection

        const results = [];
        let scanned = 0;
        let nextCursor = cursorDocId || null;

        let queryRef = db
            .collection("cars")
            .orderBy(admin.firestore.FieldPath.documentId());

        // If you want to hide deleted cars:
        // queryRef = queryRef.where("isDeleted", "==", false);
        // ⚠️ If you add where, you may need an index.

        if (nextCursor) {
            queryRef = queryRef.startAfter(nextCursor);
        }

        while ((limit == null || results.length < limit) && scanned < MAX_SCAN_DOCS) {
            const snap = await queryRef.limit(CHUNK_SIZE).get();
            if (snap.empty) break;

            const docs = snap.docs;
            scanned += docs.length;
            nextCursor = docs[docs.length - 1].id;

            for (const doc of docs) {
                const d = doc.data() || {};
                const name = str(d.carName).toLowerCase();

                if (name.includes(q)) {
                    results.push(mapCarDoc(doc));
                    if (limit != null && results.length >= limit) break;
                }
            }

            // continue next chunk
            queryRef = db
                .collection("cars")
                .orderBy(admin.firestore.FieldPath.documentId())
                .startAfter(nextCursor);
        }



        console.log("cars length:", results.length);

        return res.status(200).json({
            success: true,
            mode: "search",
            query: qRaw,
            scannedDocs: scanned,
            count: results.length,
            carsList: results,
            nextCursorDocId: null, // as per your requirement
            hasMore: false,
        });
    } catch (error) {
        console.error("Error searching cars:", error);
        return res.status(500).json({
            success: false,
            message: "Error searching cars",
            error: error.message,
        });
    }
};

// ======================= FILTER CARS (NO EXTRA FIELD REQUIRED) =======================
// Behavior:
// - If body.limit is provided -> returns up to limit (capped at 50)
// - If body.limit is NOT provided -> returns all matches from fetched candidates
//   (still bounded by CANDIDATE_LIMIT to protect server)
exports.filterCarsForBuyACar = async (req, res) => {
    try {
        // ✅ limit is OPTIONAL
        const limitRaw = req.body?.limit;
        const limit =
            limitRaw === undefined || limitRaw === null || String(limitRaw).trim() === ""
                ? null
                : Math.min(parseInt(limitRaw, 10), 50);

        const make = str(req.body?.make).trim();
        const model = str(req.body?.model).trim();
        const variant = str(req.body?.variant).trim();
        const dealerState = str(req.body?.dealerState).trim();

        const fuelTypes = Array.isArray(req.body?.fuelTypes)
            ? req.body.fuelTypes.map(str).filter(Boolean)
            : [];
        const transmissions = Array.isArray(req.body?.transmissions)
            ? req.body.transmissions.map(str).filter(Boolean)
            : [];
        const bodyTypes = Array.isArray(req.body?.bodyTypes)
            ? req.body.bodyTypes.map(str).filter(Boolean)
            : [];

        const carAgeYears = req.body?.carAgeYears || null; // {min,max}
        const mileageKm = req.body?.mileageKm || null;     // {min,max}

        // ==================== build base query ====================
        let query = db.collection("cars");

        // If you want to hide deleted cars:
        // query = query.where("isDeleted", "==", false);
        // ⚠️ may require index depending on your Firestore settings.

        // equality filters (safe)
        if (make) query = query.where("carMake", "==", make);
        if (model) query = query.where("carModel", "==", model);
        if (variant) query = query.where("carVariant", "==", variant);
        if (dealerState) query = query.where("dealerState", "==", dealerState);

        // We DO NOT use Firestore "in" here (to avoid limitations).
        // We will filter multi-select fields in memory.

        // ✅ If limit not provided -> fetch more candidates (but still safe cap)
        const CANDIDATE_LIMIT =
            limit == null ? 2000 : Math.min(limit * 20, 500);

        const snap = await query.limit(CANDIDATE_LIMIT).get();
        const docs = snap.docs;

        const nowYear = new Date().getFullYear();

        const parseIntLoose = (val) => {
            if (typeof val === "number") return Number.isFinite(val) ? val : 0;
            const cleaned = str(val).replace(/[^0-9]/g, "");
            const n = parseInt(cleaned || "0", 10);
            return Number.isFinite(n) ? n : 0;
        };

        const carAgeFromYear = (yearVal) => {
            const y = parseIntLoose(yearVal);
            if (!y) return 999;
            return Math.max(0, nowYear - y);
        };

        const minAge = carAgeYears?.min != null ? parseIntLoose(carAgeYears.min) : null;
        const maxAge = carAgeYears?.max != null ? parseIntLoose(carAgeYears.max) : null;

        const minKm = mileageKm?.min != null ? parseIntLoose(mileageKm.min) : null;
        const maxKm = mileageKm?.max != null ? parseIntLoose(mileageKm.max) : null;

        // sets for fast lookup
        const fuelSet = new Set(fuelTypes);
        const transSet = new Set(transmissions);
        const bodySet = new Set(bodyTypes);

        const filtered = [];

        for (const doc of docs) {
            const d = doc.data() || {};

            // multi-select checks (only if user selected something)
            if (fuelSet.size > 0 && !fuelSet.has(str(d.carFuelType))) continue;
            if (transSet.size > 0 && !transSet.has(str(d.carTransmission))) continue;
            if (bodySet.size > 0 && !bodySet.has(str(d.carBodyType))) continue;

            // car age range
            if (minAge != null || maxAge != null) {
                const age = carAgeFromYear(d.carYear);
                if (minAge != null && age < minAge) continue;
                if (maxAge != null && age > maxAge) continue;
            }

            // mileage range
            if (minKm != null || maxKm != null) {
                const kms = parseIntLoose(d.carKms);
                if (minKm != null && kms < minKm) continue;
                if (maxKm != null && kms > maxKm) continue;
            }

            filtered.push(mapCarDoc(doc));
            if (limit != null && filtered.length >= limit) break;
        }

        return res.status(200).json({
            success: true,
            mode: "filter",
            fetchedCandidates: docs.length,
            count: filtered.length,
            carsList: filtered,
            nextCursorDocId: null,
            hasMore: false, // as per your requirement
        });
    } catch (error) {
        console.error("Error filtering cars:", error);
        return res.status(500).json({
            success: false,
            message: "Error filtering cars",
            error: error.message,
        });
    }
};




// ======================= Fetch Cars List =======================
// FINAL APPROACH (Cursor based):
// - pageNumber = 0  => return 10 "random-ish" cars (random slice by documentId)
// - pageNumber >= 1 => return cars in sequence using cursor (startAfter)
// - frontend will send only the FIRST 10 random ids as excludedIds on every request
// - if excluded ids appear, we remove them (it's OK to return < limit)
// - backend returns nextCursorDocId so frontend can fetch next page efficiently

exports.fetch10RandomCarsListForBuyACar = async (req, res) => {
    try {
        // ------------------ Inputs ------------------
        // pageNumber: 0 => random, 1+ => sequential
        const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);
        const pageNumber = Math.max(parseInt(req.query.pageNumber || "0", 10), 0);

        // cursorDocId: used for sequential paging (pageNumber >= 1)
        // frontend should store the "nextCursorDocId" returned from API and send it back
        const cursorDocId =
            (req.query.cursorDocId || req.query.cursor || req.body?.cursorDocId || "") + "";

        // excludedIds: frontend sends ONLY the first 10 random ids here (same list every time)
        // Accept from body (preferred) or from query as comma-separated string
        const excludedIdsRaw =
            req.body?.excludedIds ??
            req.query.excludedIds ??
            req.query.excludeIds ??
            [];

        const excludedIds = Array.isArray(excludedIdsRaw)
            ? excludedIdsRaw
            : String(excludedIdsRaw)
                .split(",")
                .map((x) => x.trim())
                .filter(Boolean);

        const excludedSet = new Set(excludedIds);


        // Random base62 string to use as a "random start point" for documentId ordering.
        // This gives a "random-ish slice" without needing extra fields in Firestore.
        const randomDocIdSeed = (len = 20) => {
            const chars =
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
            let out = "";
            for (let i = 0; i < len; i++) {
                out += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return out;
        };

        // ------------------ Base query ------------------
        const carsRef = db.collection("cars");
        const orderByDocId = carsRef.orderBy(admin.firestore.FieldPath.documentId());

        // ============================================================
        // 1) pageNumber === 0 => return random cars (first time)
        // ============================================================
        if (pageNumber === 0) {
            const seed = randomDocIdSeed(20);

            // Try to fetch a slice starting from a random seed
            const snap1 = await orderByDocId.startAt(seed).limit(limit).get();

            // If we got less than limit, "wrap around" from beginning
            let docs = snap1.docs;
            if (docs.length < limit) {
                const remaining = limit - docs.length;
                const snap2 = await orderByDocId.limit(remaining).get();
                docs = docs.concat(snap2.docs);
            }

            const carsList = docs.map(mapCarDoc);

            // These are the ids frontend should store & send back as excludedIds
            const randomIds = docs.map((d) => d.id);

            return res.status(200).json({
                success: true,
                mode: "random",
                pageNumber,
                limit,
                count: carsList.length,
                // send these to frontend so they can store and send as excludedIds later
                excludedIds: randomIds,
                carsList,
                // No sequential cursor here (sequential starts from beginning on pageNumber=1)
                nextCursorDocId: null,
                hasMore: carsList.length === limit,
            });
        }

        // ============================================================
        // 2) pageNumber >= 1 => sequential paging using cursor
        // ============================================================
        let query = orderByDocId;

        // If cursorDocId is provided, start after it (this is the main improvement)
        if (cursorDocId) {
            query = query.startAfter(cursorDocId);
        }

        // Fetch next window
        const snap = await query.limit(limit).get();

        // If no docs found
        if (snap.empty) {
            return res.status(200).json({
                success: true,
                mode: "sequential",
                pageNumber,
                limit,
                count: 0,
                carsList: [],
                nextCursorDocId: null,
                hasMore: false,
            });
        }

        // IMPORTANT:
        // Cursor is based on the last doc from Firestore snapshot (NOT filtered list)
        const rawDocs = snap.docs;
        const nextCursorDocId = rawDocs[rawDocs.length - 1].id;

        // Remove excluded ids (only those first 10 random ids)
        const filteredDocs = rawDocs.filter((doc) => !excludedSet.has(doc.id));
        const carsList = filteredDocs.map(mapCarDoc);

        return res.status(200).json({
            success: true,
            mode: "sequential",
            pageNumber,
            limit,
            // useful info for debugging
            fetchedCount: rawDocs.length, // how many firestore docs fetched
            excludedCount: rawDocs.length - filteredDocs.length, // how many removed due to excludedIds
            count: carsList.length, // how many returned to frontend
            carsList,
            nextCursorDocId,
            // hasMore is "likely" if we fetched a full window
            hasMore: rawDocs.length === limit,
        });
    } catch (error) {
        console.error("Error fetching cars:", error);
        return res.status(500).json({
            success: false,
            message: "Error fetching cars",
            error: error.message,
        });
    }
};




// ======================= Save Interested Buyer =======================
exports.saveInterestedBuyer = async (req, res) => {
    try {
        const { dealerDocId, carDocId, activityType, interestedBuyerId } = req.body;

        // basic guard (optional but recommended)
        if (!dealerDocId || !carDocId || !activityType || !interestedBuyerId) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields: dealerDocId, carDocId, activityType, interestedBuyerId",
            });
        }

        const filter = {
            dealerDocId,
            carDocId,
            activityType,
            interestedBuyerId,
        };

        // If exists -> update timestamps only
        // If not -> insert new with full body
        const savedDoc = await InterestedBuyersModel.findOneAndUpdate(
            filter,
            {
                // only update timestamps when doc exists
                $set: { updatedAt: new Date() },

                // only set full data when inserting the first time
                $setOnInsert: req.body,
            },
            {
                new: true,
                upsert: true,
            }
        );

        return res.status(200).json({
            success: true,
            savedDoc,
        });

    } catch (error) {
        console.error("Error saving interested buyer:", error);
        return res.status(500).json({
            success: false,
            message: "Error saving interested buyer",
            error: error.message,
        });
    }
};


