// plugin_to_update_double_value.js

const { toMongoDouble } = require('../Utils/convert_to_double_for_mongo');

module.exports = function pluginToUpdateDoubleValue(schema, { paths = [] } = {}) {
    if (!paths.length) return;

    function hook(next) {
        const update = this.getUpdate() || {};
        const ops = ["$set", "$setOnInsert", "$inc", "$mul", "$min", "$max"];

        // direct: { variableMargin: ... }
        for (const p of paths) {
            if (Object.prototype.hasOwnProperty.call(update, p)) {
                update[p] = toMongoDouble(update[p]);
            }
        }

        // operator: { $set: { variableMargin: ... } }
        for (const op of ops) {
            if (!update[op]) continue;
            for (const p of paths) {
                if (Object.prototype.hasOwnProperty.call(update[op], p)) {
                    update[op][p] = toMongoDouble(update[op][p]);
                }
            }
        }

        this.setUpdate(update);
        next();
    }

    schema.pre("updateOne", hook);
    schema.pre("updateMany", hook);
    schema.pre("findOneAndUpdate", hook);
};
