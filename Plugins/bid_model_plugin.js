const mongoose = require('mongoose');
const { getMargins } = require('../Helper Functions/car_margin_helper');

function applyBidMarginsFromCar(schema, {
    carModelPath = '../Models/carModel',
    carIdField = 'carId',               // bids.carId (string ObjectId)
    fixedField = 'fixedMargin',
    variableField = 'variableMargin',
    carSelect = 'priceDiscovery fixedMargin variableMargin',
} = {}) {

    const toObjectId = (id) => {
        if (!id) return null;
        if (!mongoose.isValidObjectId(id)) return null;
        return new mongoose.Types.ObjectId(id);
    };



    // save/create(one)
    schema.pre('save', async function (next) {
        try {
            if (!this.isNew) return next();

            const shouldSetFixed = this[fixedField] == null || this[fixedField] === 0;
            if (shouldSetFixed) {
                const { fixedMargin } = await getMargins(0); // or car?.priceDiscovery ?? 0 if you prefer
                this[fixedField] = fixedMargin;
            }

            const shouldSetVariable = this[variableField] == null || this[variableField] === 0;
            if (!shouldSetFixed && !shouldSetVariable) return next();

            // fixed always consistent
            // if (shouldSetFixed) this[fixedField] = FIXED_MARGIN;

            const carOid = toObjectId(this[carIdField]);
            if (!carOid) return next();

            const CarModel = require(carModelPath);
            const car = await CarModel.findById(carOid).select(carSelect).lean();

            if (shouldSetVariable) {
                if (car?.[variableField] != null && car[variableField] !== 0) {
                    this[variableField] = car[variableField];
                } else if (car?.priceDiscovery != null) {
                    // this[variableField] = getMargins(car.priceDiscovery).variableMargin;
                    const { variableMargin } = await getMargins(car.priceDiscovery);
                    this[variableField] = variableMargin;


                }
            }

            next();
        } catch (e) {
            next(e);
        }
    });

    // create(array)/insertMany
    schema.pre('insertMany', async function (next, docs) {
        try {
            const shouldProcess = docs.some(d =>
                (d[fixedField] == null || d[fixedField] === 0) ||
                (d[variableField] == null || d[variableField] === 0)
            );
            if (!shouldProcess) return next();

            const ids = [...new Set(docs.map(d => d[carIdField]).filter(Boolean))];
            const objectIds = ids.map(toObjectId).filter(Boolean);

            // set fixed for all that need it (no db needed)
            // for (const doc of docs) {
            //     if (doc[fixedField] == null || doc[fixedField] === 0) doc[fixedField] = FIXED_MARGIN;
            // }
            const { fixedMargin } = await getMargins(0);
            for (const doc of docs) {
                if (doc[fixedField] == null || doc[fixedField] === 0) doc[fixedField] = fixedMargin;
            }


            if (objectIds.length === 0) return next();

            const CarModel = require(carModelPath);
            const cars = await CarModel
                .find({ _id: { $in: objectIds } })
                .select('_id ' + carSelect)
                .lean();

            // key by string version of _id (same type as bid.carId)
            const map = new Map(cars.map(c => [String(c._id), c]));

            for (const doc of docs) {
                const shouldSetVariable = doc[variableField] == null || doc[variableField] === 0;
                if (!shouldSetVariable) continue;

                const car = map.get(String(doc[carIdField]));
                if (!car) continue;

                if (car?.[variableField] != null && car[variableField] !== 0) {
                    doc[variableField] = car[variableField];
                } else if (car?.priceDiscovery != null) {
                    // doc[variableField] = getMargins(car.priceDiscovery).variableMargin;
                    const { variableMargin } = await getMargins(car.priceDiscovery);
                    doc[variableField] = variableMargin;

                }
            }

            next();
        } catch (e) {
            next(e);
        }
    });
}

module.exports = applyBidMarginsFromCar;
