const mongoose = require('mongoose');
const { getMargins } = require('../Helper Functions/car_margin_helper');

function applyAutoBidMarginsFromCar(schema, {
    carModelPath = '../Models/carModel',
    carIdField = 'carId',          // AutoBid.carId (string ObjectId)
    fixedField = 'fixedMargin',
    variableField = 'variableMargin',
    carSelect = 'priceDiscovery fixedMargin variableMargin',
} = {}) {

    const toObjectId = (id) => {
        if (!id) return null;
        if (!mongoose.isValidObjectId(id)) return null;
        return new mongoose.Types.ObjectId(id);
    };

    async function fetchCarByIdString(carIdStr) {
        const oid = toObjectId(carIdStr);
        if (!oid) return null;

        const CarModel = require(carModelPath);
        return await CarModel.findById(oid).select(carSelect).lean();
    }

    async function applyMarginsToDoc(doc, car) {
        // // fixed always consistent
        // doc[fixedField] = FIXED_MARGIN;

        // if (car?.[variableField] != null && car[variableField] !== 0) {
        //     doc[variableField] = car[variableField];
        // } else if (car?.priceDiscovery != null) {
        //     // doc[variableField] = await getMargins(car.priceDiscovery).variableMargin;
        //     const { variableMargin } = await getMargins(car.priceDiscovery);
        //     doc[variableField] = variableMargin;

        // }

        if (car?.[variableField] != null && car[variableField] !== 0) {
            // variable override from car, but fixed should still come from config
            const { fixedMargin } = await getMargins(car.priceDiscovery ?? 0);
            doc[fixedField] = fixedMargin;
            doc[variableField] = car[variableField];
            return;
        }

        if (car?.priceDiscovery != null) {
            const { fixedMargin, variableMargin } = await getMargins(car.priceDiscovery);
            doc[fixedField] = fixedMargin;
            doc[variableField] = variableMargin;
            return;
        }

        // if no car / no priceDiscovery, still set fixed from config fallback
        const { fixedMargin } = await getMargins(0);
        doc[fixedField] = fixedMargin;
    }

    async function applyMarginsToUpdate(update, car) {
        // update.$set = update.$set || {};
        // update.$set[fixedField] = FIXED_MARGIN;

        // if (car?.[variableField] != null && car[variableField] !== 0) {
        //     update.$set[variableField] = car[variableField];
        // } else if (car?.priceDiscovery != null) {
        //     // update.$set[variableField] = await getMargins(car.priceDiscovery).variableMargin;
        //     const { variableMargin } = await getMargins(car.priceDiscovery);
        //     update.$set[variableField] = variableMargin;

        // }

        update.$set = update.$set || {};

        if (car?.[variableField] != null && car[variableField] !== 0) {
            const { fixedMargin } = await getMargins(car.priceDiscovery ?? 0);
            update.$set[fixedField] = fixedMargin;
            update.$set[variableField] = car[variableField];
            return;
        }

        if (car?.priceDiscovery != null) {
            const { fixedMargin, variableMargin } = await getMargins(car.priceDiscovery);
            update.$set[fixedField] = fixedMargin;
            update.$set[variableField] = variableMargin;
            return;
        }

        const { fixedMargin } = await getMargins(0);
        update.$set[fixedField] = fixedMargin;
    }

    // ✅ CREATE: save/create(one)
    schema.pre('save', async function (next) {
        try {
            if (!this.isNew) return next();

            const car = await fetchCarByIdString(this[carIdField]);
            await applyMarginsToDoc(this, car);

            next();
        } catch (e) {
            next(e);
        }
    });

    // ✅ CREATE: insertMany/create(array)
    schema.pre('insertMany', async function (next, docs) {
        try {
            const ids = [...new Set(docs.map(d => d[carIdField]).filter(Boolean))];
            const objectIds = ids.map(toObjectId).filter(Boolean);

            // fixed without db
            // for (const d of docs) d[fixedField] = FIXED_MARGIN;
            const { fixedMargin } = await getMargins(0);
            for (const d of docs) d[fixedField] = fixedMargin;

            if (objectIds.length === 0) return next();

            const CarModel = require(carModelPath);
            const cars = await CarModel.find({ _id: { $in: objectIds } })
                .select('_id ' + carSelect)
                .lean();

            const map = new Map(cars.map(c => [String(c._id), c]));

            for (const d of docs) {
                const car = map.get(String(d[carIdField]));
                if (!car) continue;

                if (car?.[variableField] != null && car[variableField] !== 0) {
                    d[variableField] = car[variableField];
                } else if (car?.priceDiscovery != null) {
                    // d[variableField] = await getMargins(car.priceDiscovery).variableMargin;
                    const { variableMargin } = await getMargins(car.priceDiscovery);
                    d[variableField] = variableMargin;

                }
            }

            next();
        } catch (e) {
            next(e);
        }
    });

    // ✅ UPDATE: findOneAndUpdate (ONLY if refreshMargins:true in options)
    schema.pre('findOneAndUpdate', async function (next) {
        try {
            const opts = this.getOptions() || {};
            if (opts.refreshMargins !== true) return next(); // ✅ only when told

            const update = this.getUpdate() || {};
            const $set = update.$set || {};

            // which carId should we use?
            const carIdNew = $set[carIdField] ?? update[carIdField];
            const carIdInFilter = this.getQuery()?.[carIdField];
            const carIdToUse = carIdNew ?? carIdInFilter;

            const car = await fetchCarByIdString(carIdToUse);
            if (!car) return next();

            await applyMarginsToUpdate(update, car);

            this.setUpdate(update);
            next();
        } catch (e) {
            next(e);
        }
    });

    // ✅ UPDATE: updateOne (ONLY if refreshMargins:true in options)
    schema.pre('updateOne', async function (next) {
        try {
            const opts = this.getOptions() || {};
            if (opts.refreshMargins !== true) return next(); // ✅ only when told

            const update = this.getUpdate() || {};
            const $set = update.$set || {};

            const carIdNew = $set[carIdField] ?? update[carIdField];
            const carIdInFilter = this.getQuery()?.[carIdField];
            const carIdToUse = carIdNew ?? carIdInFilter;

            const car = await fetchCarByIdString(carIdToUse);
            if (!car) return next();

            await applyMarginsToUpdate(update, car);

            this.setUpdate(update);
            next();
        } catch (e) {
            next(e);
        }
    });
}

module.exports = applyAutoBidMarginsFromCar;
