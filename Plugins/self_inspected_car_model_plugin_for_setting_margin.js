
// Plugins/self_inspected_car_model_plugin_for_setting_margin.js
const { getSelfInspectedCarMargins } = require('../Helper Functions/self_inspected_car_margin_helper');

function applySelfInspectedCarMargins(schema, {
    priceField = 'priceDiscovery',
    fixedField = 'fixedMargin',
    variableField = 'variableMargin',
} = {}) {

    // helper → check if margins already exist
    function marginsAlreadySet(doc) {
       return doc[fixedField] !== 0 || doc[variableField] !== 0;
    }

    async function setMargins(doc) {
        if (marginsAlreadySet(doc)) return;

        const pd = doc[priceField];
        if (pd == null || pd === 0) return;

        const { fixedMargin, variableMargin } = await getSelfInspectedCarMargins(pd);

        doc[fixedField] = fixedMargin;
        doc[variableField] = variableMargin;
    }

    // ================= CREATE =================
    schema.pre('save', async function (next) {
        if (!this.isNew) return next();

        // only if priceDiscovery is provided at creation
        if (this[priceField] != null && this[priceField] !== 0) {
            await setMargins(this);
        }

        next();
    });

    // ================= INSERT MANY =================
    schema.pre('insertMany', async function (next, docs) {
        for (const doc of docs) {
            if (doc[priceField] != null && doc[priceField] !== 0) {
                await setMargins(doc);
            }
        }
        next();
    });

    // ================= UPDATE (findOneAndUpdate) =================
    schema.pre('findOneAndUpdate', async function (next) {
        const update = this.getUpdate() || {};

        const pd =
            update[priceField] ??
            update.$set?.[priceField];

        if (pd == null || pd === 0) return next();

        // check existing doc → only run if priceDiscovery was not set before
        const existingDoc = await this.model.findOne(this.getQuery()).lean();

        if (existingDoc && existingDoc[priceField]) {
            return next(); // already had priceDiscovery → do nothing
        }

        const { fixedMargin, variableMargin } = await getSelfInspectedCarMargins(pd);

        update.$set = update.$set || {};
        update.$set[fixedField] = fixedMargin;
        update.$set[variableField] = variableMargin;

        this.setUpdate(update);
        next();
    });

    // ================= UPDATE ONE =================
    schema.pre('updateOne', async function (next) {
        const update = this.getUpdate() || {};

        const pd =
            update[priceField] ??
            update.$set?.[priceField];

        if (pd == null || pd === 0) return next();

        const existingDoc = await this.model.findOne(this.getQuery()).lean();

        if (existingDoc && existingDoc[priceField]) {
            return next();
        }

        const { fixedMargin, variableMargin } = await getSelfInspectedCarMargins(pd);

        update.$set = update.$set || {};
        update.$set[fixedField] = fixedMargin;
        update.$set[variableField] = variableMargin;

        this.setUpdate(update);
        next();
    });

    // ================= UPSERT =================
    schema.pre('findOneAndUpdate', async function (next) {
        const opts = this.getOptions() || {};
        if (!opts.upsert) return next();

        const update = this.getUpdate() || {};
        const pd =
            update[priceField] ??
            update.$set?.[priceField];

        if (pd == null || pd === 0) return next();

        const { fixedMargin, variableMargin } = await getSelfInspectedCarMargins(pd);

        update.$setOnInsert = update.$setOnInsert || {};
        update.$setOnInsert[fixedField] = fixedMargin;
        update.$setOnInsert[variableField] = variableMargin;

        this.setUpdate(update);
        next();
    });
}

module.exports = applySelfInspectedCarMargins;