
// Helper Functions/self_inspected_car_margin_helper.js
const SelfInspectedCarMarginsModel = require("../Models/selfInspectedCarMarginsModel");

// fallback defaults (same as your current logic)
const SELF_INSPECTED_CAR_MARGIN_DEFAULT_CONFIG = {
    fixedMargin: 2,
    variableRanges: [
        { min: 0, max: 1, margin: 8 },
        { min: 1, max: 3, margin: 6 },
        { min: 3, max: 5, margin: 4 },
        { min: 5, max: 10, margin: 2 },
        { min: 10, max: 25, margin: 2 },
        { min: 25, max: Number.POSITIVE_INFINITY, margin: 2 },
    ],
};

// simple in-memory cache (fast)
let _cache = {
    value: null,
    expiresAt: 0,
};

const CACHE_TTL_MS = 60 * 1000; // 60 seconds (adjust)

function convertSelfInspectedCarPriceDiscoveryValueToLacs(priceDiscovery) {
    const n = Number(priceDiscovery || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return n > 1000 ? n / 100000 : n;
}

async function getMarginConfig() {
    // serve from cache
    const now = Date.now();
    if (_cache.value && now < _cache.expiresAt) return _cache.value;

    try {
        // assume only 1 doc; pick latest if multiple exist
        const doc = await SelfInspectedCarMarginsModel.findOne({}).sort({ updatedAt: -1 }).lean();
        const cfg = doc
            ? {
                fixedMargin: Number(doc.fixedMargin ?? SELF_INSPECTED_CAR_MARGIN_DEFAULT_CONFIG.fixedMargin),
                variableRanges: Array.isArray(doc.variableRanges) && doc.variableRanges.length
                    ? doc.variableRanges
                    : SELF_INSPECTED_CAR_MARGIN_DEFAULT_CONFIG.variableRanges,
            }
            : SELF_INSPECTED_CAR_MARGIN_DEFAULT_CONFIG;

        _cache.value = cfg;
        _cache.expiresAt = now + CACHE_TTL_MS;
        return cfg;
    } catch (e) {
        // if DB fails, never break app: fallback
        return SELF_INSPECTED_CAR_MARGIN_DEFAULT_CONFIG;
    }
}

async function getSelfInspectedCarMargins(priceDiscovery) {
    const lacs = convertSelfInspectedCarPriceDiscoveryValueToLacs(priceDiscovery);
    const cfg = await getMarginConfig();

    const fixedMargin = Number(cfg.fixedMargin ?? SELF_INSPECTED_CAR_MARGIN_DEFAULT_CONFIG.fixedMargin);

    let variableMargin = 0;
    // find matching range
    for (const r of cfg.variableRanges || []) {
        const min = Number(r.min ?? 0);
        const max = Number(r.max ?? Number.POSITIVE_INFINITY);
        const m = Number(r.margin ?? 0);

        // match your "0 < lacs <= X" behavior
        if (lacs > min && lacs <= max) {
            variableMargin = m;
            break;
        }
    }

    // fallback if nothing matched
    if (!Number.isFinite(variableMargin) || variableMargin <= 0) {
        // last fallback: same old logic
        if (lacs > 0 && lacs <= 1) variableMargin = 8;
        else if (lacs <= 3) variableMargin = 6;
        else if (lacs <= 5) variableMargin = 4;
        else if (lacs <= 10) variableMargin = 2;
        else if (lacs <= 25) variableMargin = 2;
        else variableMargin = 2;
    }

    return { fixedMargin, variableMargin };
}

async function getSelfInspectedCarVariableMargin(priceDiscovery) {
    return (await getSelfInspectedCarMargins(priceDiscovery)).variableMargin;
}

// optional: call this after you update config to refresh cache immediately
function clearSelfInspectedCarMarginsCache() {
    _cache.value = null;
    _cache.expiresAt = 0;
}

module.exports = {
    SELF_INSPECTED_CAR_MARGIN_DEFAULT_CONFIG,
    convertSelfInspectedCarPriceDiscoveryValueToLacs,
    getSelfInspectedCarMargins,           // ✅ now async
    getSelfInspectedCarVariableMargin,    // ✅ now async
    clearSelfInspectedCarMarginsCache,
};


