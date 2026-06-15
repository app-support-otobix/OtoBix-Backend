// convert_to_double_for_mongo.js
const mongoose = require("mongoose");
const { Double } = require("mongodb");

let isRegistered = false;

function convertToDoubleForMongo() {
    if (!isRegistered) {
        class MongoDouble extends mongoose.SchemaType {
            constructor(key, options) {
                super(key, options, "MongoDouble");

                // copy Number's query operator handlers ($gt, $lt, $in, etc.)
                this.$conditionalHandlers =
                    mongoose.Schema.Types.Number.prototype.$conditionalHandlers;

                // ✅ IMPORTANT: make reads return a JS number (so `=== 0` works everywhere)
                this.get((v) => {
                    if (v === null || v === undefined || v === "") return v;
                    if (v instanceof Double) return v.valueOf(); // Double -> number
                    return v; // already a number
                });
            }

            cast(val) {
                if (val === null || val === undefined || val === "") return val;
                if (val instanceof Double) return val;

                const n = Number(val);
                if (Number.isNaN(n)) {
                    throw new mongoose.SchemaType.CastError("MongoDouble", val, this.path);
                }
                return new Double(n);
            }
        }

        mongoose.Schema.Types.MongoDouble = MongoDouble;
        isRegistered = true;
    }
    return mongoose.Schema.Types.MongoDouble;
}

// defaults (stored as BSON Double)
function doubleDefault(n = 0) {
    return () => new Double(Number(n) || 0);
}

function toMongoDouble(v) {
    if (v === null || v === undefined || v === "") return v;
    if (v instanceof Double) return v;
    const n = Number(v);
    if (Number.isNaN(n)) return v;
    return new Double(n);
}

module.exports = { convertToDoubleForMongo, doubleDefault, toMongoDouble };



