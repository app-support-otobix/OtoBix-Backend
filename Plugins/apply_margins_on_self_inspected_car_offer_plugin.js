// Plugin/apply_margins_on_self_inspected_car_offer_plugin.js
const mongoose = require('mongoose');
const { getSelfInspectedCarMargins } = require('../Helper Functions/self_inspected_car_margin_helper');

function applyMarginsOnSelfInspectedCarOffer(schema, {
    selfInspectedCarsModelPath = '../Models/selfInspectedCarsModel',
    carIdField = 'carId',
    fixedField = 'fixedMargin',
    variableField = 'variableMargin',
} = {}) {

    const toObjectId = (id) => {
        if (!id) return null;
        if (!mongoose.isValidObjectId(id)) return null;
        return new mongoose.Types.ObjectId(id);
    };

    // ---------------------------
    // SAVE / CREATE (single doc)
    // ---------------------------
    schema.pre('save', async function (next) {
        try {
            if (!this.isNew) return next();

            const carOid = toObjectId(this[carIdField]);
            if (!carOid) return next();

            const SelfInspectedCarsModel = require(selfInspectedCarsModelPath);

            const car = await SelfInspectedCarsModel
                .findById(carOid)
                .select('priceDiscovery fixedMargin variableMargin')
                .lean();

            // ---------------- FIXED MARGIN ----------------
            const shouldSetFixed =
                this[fixedField] == null || this[fixedField] === 0;

            if (shouldSetFixed) {
                let fixedValue = null;

                if (car?.fixedMargin != null && car.fixedMargin !== 0) {
                    fixedValue = car.fixedMargin;
                }

                if (fixedValue == null || fixedValue === 0) {
                    const { fixedMargin } = await getSelfInspectedCarMargins(0);
                    fixedValue = fixedMargin;
                }

                this[fixedField] = fixedValue;
            }

            // ---------------- VARIABLE MARGIN ----------------
            const shouldSetVariable =
                this[variableField] == null || this[variableField] === 0;

            if (shouldSetVariable) {
                if (car?.variableMargin != null && car.variableMargin !== 0) {
                    this[variableField] = car.variableMargin;
                } else if (car?.priceDiscovery != null) {
                    const { variableMargin } =
                        await getSelfInspectedCarMargins(car.priceDiscovery);

                    this[variableField] = variableMargin;
                }
            }

            next();
        } catch (e) {
            next(e);
        }
    });

    // ---------------------------
    // INSERT MANY (bulk insert)
    // ---------------------------
    schema.pre('insertMany', async function (next, docs) {
        try {
            const shouldProcess = docs.some(d =>
                (d[fixedField] == null || d[fixedField] === 0) ||
                (d[variableField] == null || d[variableField] === 0)
            );

            if (!shouldProcess) return next();

            const ids = [...new Set(
                docs.map(d => d[carIdField]).filter(Boolean)
            )];

            const objectIds = ids.map(toObjectId).filter(Boolean);

            const SelfInspectedCarsModel = require(selfInspectedCarsModelPath);

            const cars = await SelfInspectedCarsModel
                .find({ _id: { $in: objectIds } })
                .select('_id priceDiscovery fixedMargin variableMargin')
                .lean();

            const map = new Map(cars.map(c => [String(c._id), c]));

            const { fixedMargin: defaultFixed } =
                await getSelfInspectedCarMargins(0);

            for (const doc of docs) {

                const car = map.get(String(doc[carIdField]));

                // ---------------- FIXED MARGIN ----------------
                if (doc[fixedField] == null || doc[fixedField] === 0) {
                    if (car?.fixedMargin != null && car.fixedMargin !== 0) {
                        doc[fixedField] = car.fixedMargin;
                    } else {
                        doc[fixedField] = defaultFixed;
                    }
                }

                // ---------------- VARIABLE MARGIN ----------------
                if (doc[variableField] == null || doc[variableField] === 0) {
                    if (car?.variableMargin != null && car.variableMargin !== 0) {
                        doc[variableField] = car.variableMargin;
                    } else if (car?.priceDiscovery != null) {
                        const { variableMargin } =
                            await getSelfInspectedCarMargins(car.priceDiscovery);

                        doc[variableField] = variableMargin;
                    }
                }
            }

            next();
        } catch (e) {
            next(e);
        }
    });
}

module.exports = applyMarginsOnSelfInspectedCarOffer;