
// Helper Functions/car_margin_helper.js
const CarMarginsModel = require("../Models/carMarginsModel");

// fallback defaults (same as your current logic)
const DEFAULT_CONFIG = {
    fixedMargin: 2,
    variableRanges: [
        { min: 0, max: 1, margin: 16 },
        { min: 1, max: 3, margin: 14 },
        { min: 3, max: 5, margin: 12 },
        { min: 5, max: 10, margin: 10 },
        { min: 10, max: 25, margin: 8 },
        { min: 25, max: Number.POSITIVE_INFINITY, margin: 6 },
    ],
};

// simple in-memory cache (fast)
let _cache = {
    value: null,
    expiresAt: 0,
};

const CACHE_TTL_MS = 60 * 1000; // 60 seconds (adjust)

function convertPriceDiscoveryValueToLacs(priceDiscovery) {
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
        const doc = await CarMarginsModel.findOne({}).sort({ updatedAt: -1 }).lean();
        const cfg = doc
            ? {
                fixedMargin: Number(doc.fixedMargin ?? DEFAULT_CONFIG.fixedMargin),
                variableRanges: Array.isArray(doc.variableRanges) && doc.variableRanges.length
                    ? doc.variableRanges
                    : DEFAULT_CONFIG.variableRanges,
            }
            : DEFAULT_CONFIG;

        _cache.value = cfg;
        _cache.expiresAt = now + CACHE_TTL_MS;
        return cfg;
    } catch (e) {
        // if DB fails, never break app: fallback
        return DEFAULT_CONFIG;
    }
}

async function getMargins(priceDiscovery) {
    const lacs = convertPriceDiscoveryValueToLacs(priceDiscovery);
    const cfg = await getMarginConfig();

    const fixedMargin = Number(cfg.fixedMargin ?? DEFAULT_CONFIG.fixedMargin);

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
        if (lacs > 0 && lacs <= 1) variableMargin = 16;
        else if (lacs <= 3) variableMargin = 14;
        else if (lacs <= 5) variableMargin = 12;
        else if (lacs <= 10) variableMargin = 10;
        else if (lacs <= 25) variableMargin = 8;
        else variableMargin = 6;
    }

    return { fixedMargin, variableMargin };
}

async function getVariableMargin(priceDiscovery) {
    return (await getMargins(priceDiscovery)).variableMargin;
}

// optional: call this after you update config to refresh cache immediately
function clearMarginsCache() {
    _cache.value = null;
    _cache.expiresAt = 0;
}

module.exports = {
    DEFAULT_CONFIG,
    convertPriceDiscoveryValueToLacs,
    getMargins,           // ✅ now async
    getVariableMargin,    // ✅ now async
    clearMarginsCache,
};













// const FIXED_MARGIN = 4; // single source of truth

// function convertPriceDiscoveryValueToLacs(priceDiscovery) {
//     const n = Number(priceDiscovery || 0);
//     if (!Number.isFinite(n) || n <= 0) return 0;
//     return n > 1000 ? n / 100000 : n;
// }

// function getMargins(priceDiscovery) {
//     const lacs = convertPriceDiscoveryValueToLacs(priceDiscovery);

//     const fixedMargin = FIXED_MARGIN;
//     let variableMargin = 0;

//     if (lacs > 0 && lacs <= 1) variableMargin = 16;
//     else if (lacs <= 3) variableMargin = 14;
//     else if (lacs <= 5) variableMargin = 12;
//     else if (lacs <= 10) variableMargin = 10;
//     else if (lacs <= 25) variableMargin = 8;
//     else variableMargin = 6;

//     return { fixedMargin, variableMargin };
// }

// function getVariableMargin(priceDiscovery) {
//     return getMargins(priceDiscovery).variableMargin;
// }

// module.exports = {
//     FIXED_MARGIN,
//     convertPriceDiscoveryValueToLacs,
//     getMargins,
//     getVariableMargin,
// };
