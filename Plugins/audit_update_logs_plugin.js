// Plugins/audit_update_logs_plugin.js
const mongoose = require("mongoose");
const { isDeepStrictEqual } = require("util");

function getByPath(obj, path) {
    if (!obj || !path) return undefined;

    return path.split(".").reduce((acc, key) => {
        if (acc === null || typeof acc === "undefined") return undefined;
        return acc[key];
    }, obj);
}

function isIgnoredField(field, ignoreList = []) {
    if (!field) return true;

    return ignoreList.some((ignored) => {
        return field === ignored || field.startsWith(`${ignored}.`);
    });
}

function normalizeUpdate(update) {
    if (!update || typeof update !== "object" || Array.isArray(update)) {
        return null;
    }

    const normalized = {};
    const directFields = {};

    for (const [key, value] of Object.entries(update)) {
        if (key.startsWith("$")) {
            normalized[key] = value;
        } else {
            directFields[key] = value;
        }
    }

    if (Object.keys(directFields).length > 0) {
        normalized.$set = {
            ...(normalized.$set || {}),
            ...directFields,
        };
    }

    return normalized;
}

function buildChangesFromUpdate({ existingDoc, update, ignore }) {
    const changes = [];

    if (!existingDoc || !update) return changes;

    // $set
    const setData = update.$set || {};
    for (const [field, newValue] of Object.entries(setData)) {
        if (isIgnoredField(field, ignore)) continue;

        const oldValue = getByPath(existingDoc, field);
        if (!isDeepStrictEqual(oldValue, newValue)) {
            changes.push({
                field,
                from: oldValue,
                to: newValue,
            });
        }
    }

    // $unset
    const unsetData = update.$unset || {};
    for (const field of Object.keys(unsetData)) {
        if (isIgnoredField(field, ignore)) continue;

        const oldValue = getByPath(existingDoc, field);
        if (typeof oldValue !== "undefined") {
            changes.push({
                field,
                from: oldValue,
                to: null,
            });
        }
    }

    // $inc
    const incData = update.$inc || {};
    for (const [field, incValue] of Object.entries(incData)) {
        if (isIgnoredField(field, ignore)) continue;

        const oldValue = getByPath(existingDoc, field);
        const oldNumber = typeof oldValue === "number" ? oldValue : 0;
        const incNumber = typeof incValue === "number" ? incValue : Number(incValue || 0);
        const newValue = oldNumber + incNumber;

        if (!isDeepStrictEqual(oldValue, newValue)) {
            changes.push({
                field,
                from: oldValue,
                to: newValue,
            });
        }
    }

    return changes;
}

function buildChangesFromDocument({ existingDoc, currentDoc, modifiedPaths, ignore }) {
    const changes = [];

    if (!existingDoc || !currentDoc || !Array.isArray(modifiedPaths)) {
        return changes;
    }

    for (const field of modifiedPaths) {
        if (isIgnoredField(field, ignore)) continue;

        const oldValue = getByPath(existingDoc, field);
        const newValue = currentDoc.get(field);

        if (!isDeepStrictEqual(oldValue, newValue)) {
            changes.push({
                field,
                from: oldValue,
                to: newValue,
            });
        }
    }

    return changes;
}

module.exports = function auditUpdateLogsPlugin(schema, options = {}) {
    const {
        logsPath = "logs",
        ignore = ["__v", "createdAt", "updatedAt", "logs"],
        metaOptionKey = "audit", // for query updates: { audit: { changedBy, source } }
        documentMetaPath = "$locals", // for save(): doc.$locals.audit = { changedBy, source }
        consoleErrors = true,
    } = options;

    // Auto-add logs field if not already present
    if (!schema.path(logsPath)) {
        const changeSchema = new mongoose.Schema(
            {
                field: { type: String, trim: true, default: "" },
                from: { type: mongoose.Schema.Types.Mixed, default: null },
                to: { type: mongoose.Schema.Types.Mixed, default: null },
            },
            { _id: false }
        );

        const logSchema = new mongoose.Schema(
            {
                changedAt: { type: Date, default: Date.now },
                changedBy: { type: String, trim: true, default: "" },
                source: { type: String, trim: true, default: "" },
                changes: {
                    type: [changeSchema],
                    default: [],
                },
            },
            { _id: false }
        );

        schema.add({
            [logsPath]: {
                type: [logSchema],
                default: [],
            },
        });
    }

    const finalIgnore = Array.from(new Set([...ignore, logsPath]));

    function safeLogError(message, error) {
        if (!consoleErrors) return;
        console.error(`[auditUpdateLogsPlugin] ${message}`, error?.message || error);
    }

    // ---------------------------
    // Query middleware
    // Works for findOneAndUpdate, findByIdAndUpdate, updateOne
    // ---------------------------
    async function handleQueryMiddleware() {
        try {
            const rawUpdate = this.getUpdate();

            // ignore pipeline updates safely
            if (!rawUpdate || Array.isArray(rawUpdate)) {
                return;
            }

            const normalizedUpdate = normalizeUpdate(rawUpdate);
            if (!normalizedUpdate) return;

            const query = this.getQuery() || {};
            const existingDoc = await this.model.findOne(query).lean();

            // no existing doc => skip logs
            if (!existingDoc) {
                return;
            }

            const changes = buildChangesFromUpdate({
                existingDoc,
                update: normalizedUpdate,
                ignore: finalIgnore,
            });

            if (!changes.length) {
                return;
            }

            const queryOptions = this.getOptions() || {};
            const audit = queryOptions[metaOptionKey] || {};

            const logEntry = {
                changedAt: new Date(),
                changedBy: audit.changedBy || "",
                source: audit.source || "",
                changes,
            };

            const nextUpdate = {
                ...normalizedUpdate,
                $push: {
                    ...(normalizedUpdate.$push || {}),
                    [logsPath]: logEntry,
                },
            };

            this.setUpdate(nextUpdate);
        } catch (error) {
            safeLogError("Query middleware failed. Skipping audit log.", error);
            // do not throw
        }
    }

    schema.pre("findOneAndUpdate", handleQueryMiddleware);
    schema.pre("updateOne", handleQueryMiddleware);

    // ---------------------------
    // Document middleware
    // Works for doc.save()
    // ---------------------------
    schema.pre("save", async function (next) {
        try {
            // Do not create logs on new document creation
            if (this.isNew) {
                return next();
            }

            const modifiedPaths = this.modifiedPaths().filter((field) => {
                return !isIgnoredField(field, finalIgnore);
            });

            if (!modifiedPaths.length) {
                return next();
            }

            const existingDoc = await this.constructor.findById(this._id).lean();
            if (!existingDoc) {
                return next();
            }

            const changes = buildChangesFromDocument({
                existingDoc,
                currentDoc: this,
                modifiedPaths,
                ignore: finalIgnore,
            });

            if (!changes.length) {
                return next();
            }

            const localMeta = this[documentMetaPath]?.[metaOptionKey] || {};

            if (!Array.isArray(this[logsPath])) {
                this[logsPath] = [];
            }

            this[logsPath].push({
                changedAt: new Date(),
                changedBy: localMeta.changedBy || "",
                source: localMeta.source || "",
                changes,
            });

            return next();
        } catch (error) {
            safeLogError("Save middleware failed. Skipping audit log.", error);
            return next(); // do not block save
        }
    });
};