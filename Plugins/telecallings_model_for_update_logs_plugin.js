// Plugins/telecallings_model_for_update_logs_plugin.js
const mongoose = require("mongoose");

function isEqual(a, b) {
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    return JSON.stringify(a) === JSON.stringify(b);
}

module.exports = function createLogsAutomaticallyOnUpdatePlugin(schema, options = {}) {
    const {
        logsPath = "logs",
        ignore = ["appointmentId", "logs", "__v", "createdAt", "updatedAt"],
        metaOptionKey = "audit", // we will pass { audit: { changedBy, source } } in query options
    } = options;

    schema.pre("findOneAndUpdate", async function () {
        const update = this.getUpdate() || {};
        const $set = update.$set || {};

        // remove ignored fields from updates
        for (const k of ignore) delete $set[k];

        // get old doc
        const existing = await this.model.findOne(this.getQuery()).lean();
        if (!existing) return;

        // compute diffs
        const changes = [];
        for (const [key, newVal] of Object.entries($set)) {
            if (typeof newVal === "undefined") continue;
            if (!(key in existing)) continue;

            const oldVal = existing[key];
            if (!isEqual(oldVal, newVal)) {
                changes.push({ field: key, from: oldVal, to: newVal });
            }
        }

        if (changes.length === 0) return;

        // read meta from query options
        const opts = this.getOptions() || {};
        const audit = opts[metaOptionKey] || {};

        const logEntry = {
            changedAt: new Date(),
            changedBy: audit.changedBy || "",
            source: audit.source || "",
            changes,
        };

        // attach $push logs
        const nextUpdate = {
            ...update,
            $set,
            $push: {
                ...(update.$push || {}),
                [logsPath]: logEntry,
            },
        };

        this.setUpdate(nextUpdate);
    });
};
