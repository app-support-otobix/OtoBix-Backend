
// Plugins/car_model_plugin_for_setting_margin.js
const { getMargins } = require('../Helper Functions/car_margin_helper');

function applyCarMargins(schema, {
    priceField = 'priceDiscovery',
    fixedField = 'fixedMargin',
    variableField = 'variableMargin',
} = {}) {

    async function setDocMargins(doc) {
        const shouldSetFixed = doc[fixedField] == null || doc[fixedField] === 0;
        const shouldSetVariable = doc[variableField] == null || doc[variableField] === 0;

        if (!shouldSetFixed && !shouldSetVariable) return;

        // fixed always consistent
        // if (shouldSetFixed) doc[fixedField] = FIXED_MARGIN;
        if (shouldSetFixed) {
            const { fixedMargin } = await getMargins(0);
            doc[fixedField] = fixedMargin;
        }


        const pd = doc[priceField];
        if (pd != null && shouldSetVariable) {
            // doc[variableField] = getMargins(pd).variableMargin;
            const { variableMargin } = await getMargins(pd);
            doc[variableField] = variableMargin;

        }
    }

    // save/create(one)
    schema.pre('save', async function (next) {
        if (this.isNew) await setDocMargins(this);
        next();
    });

    // create(array)/insertMany
    schema.pre('insertMany', async function (next, docs) {
        for (const doc of docs) await setDocMargins(doc);
        next();
    });

    // upsert inserts: findOneAndUpdate
    schema.pre('findOneAndUpdate', async function (next) {
        const opts = this.getOptions() || {};
        if (!opts.upsert) return next();

        const update = this.getUpdate() || {};
        const pd = update[priceField] ?? update.$set?.[priceField];

        update.$setOnInsert = update.$setOnInsert || {};
        // if (update.$setOnInsert[fixedField] == null) update.$setOnInsert[fixedField] = FIXED_MARGIN;
        if (update.$setOnInsert[fixedField] == null) {
            const { fixedMargin } = await getMargins(0);
            update.$setOnInsert[fixedField] = fixedMargin;
        }


        if (pd != null && update.$setOnInsert[variableField] == null) {
            // update.$setOnInsert[variableField] = getMargins(pd).variableMargin;
            const { variableMargin } = await getMargins(pd);
            update.$setOnInsert[variableField] = variableMargin;

        }

        this.setUpdate(update);
        next();
    });

    // upsert inserts: updateOne (optional but good)
    schema.pre('updateOne', async function (next) {
        const opts = this.getOptions() || {};
        if (!opts.upsert) return next();

        const update = this.getUpdate() || {};
        const pd = update[priceField] ?? update.$set?.[priceField];

        update.$setOnInsert = update.$setOnInsert || {};
        // if (update.$setOnInsert[fixedField] == null) update.$setOnInsert[fixedField] = FIXED_MARGIN;
        if (update.$setOnInsert[fixedField] == null) {
            const { fixedMargin } = await getMargins(0);
            update.$setOnInsert[fixedField] = fixedMargin;
        }


        if (pd != null && update.$setOnInsert[variableField] == null) {
            // update.$setOnInsert[variableField] = getMargins(pd).variableMargin;
            const { variableMargin } = await getMargins(pd);
            update.$setOnInsert[variableField] = variableMargin;

        }

        this.setUpdate(update);
        next();
    });
}

module.exports = applyCarMargins;
