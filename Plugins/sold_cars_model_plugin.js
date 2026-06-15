const mongoose = require('mongoose');
const { getMargins } = require('../Helper Functions/car_margin_helper');

function applySoldCarMarginsFromCar(schema, {
    carModelPath = '../Models/carModel',
    carIdField = 'carId',          // soldCars.carId (string ObjectId)
    fixedField = 'fixedMargin',
    variableField = 'variableMargin',
    carSelect = 'priceDiscovery fixedMargin variableMargin',
    alwaysRefreshOnUpdate = false, // true if you want margins on every update
} = {}) {

    const toObjectId = (id) => {
        if (!id) return null;
        if (!mongoose.isValidObjectId(id)) return null;
        return new mongoose.Types.ObjectId(id);
    };

    async function fetchCar(carIdStr) {
        const oid = toObjectId(carIdStr);
        if (!oid) return null;
        const CarModel = require(carModelPath);
        return await CarModel.findById(oid).select(carSelect).lean();
    }

    async function fillDoc(doc, car) {
        // doc[fixedField] = FIXED_MARGIN;
        const { fixedMargin } = await getMargins(0);
        doc[fixedField] = fixedMargin;

        if (car?.[variableField] != null && car[variableField] !== 0) {
            doc[variableField] = car[variableField];
        } else if (car?.priceDiscovery != null) {
            // doc[variableField] = getMargins(car.priceDiscovery).variableMargin;
            const { variableMargin } = await getMargins(car.priceDiscovery);
            doc[variableField] = variableMargin;
        }
    }

    // ✅ create via save/create(one)
    schema.pre('save', async function (next) {
        try {
            if (!this.isNew) return next();
            const car = await fetchCar(this[carIdField]);
            await fillDoc(this, car);
            next();
        } catch (e) {
            next(e);
        }
    });

    // ✅ create via insertMany/create(array)
    schema.pre('insertMany', async function (next, docs) {
        try {
            const ids = [...new Set(docs.map(d => d[carIdField]).filter(Boolean))];
            const objectIds = ids.map(toObjectId).filter(Boolean);

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
                    // d[variableField] = getMargins(car.priceDiscovery).variableMargin;
                    const { variableMargin } = await getMargins(car.priceDiscovery);
                    d[variableField] = variableMargin;
                }
            }

            next();
        } catch (e) {
            next(e);
        }
    });

    // ✅ optional refresh on update
    schema.pre('findOneAndUpdate', async function (next) {
        try {
            if (!alwaysRefreshOnUpdate) return next();

            const update = this.getUpdate() || {};
            const $set = update.$set || {};
            const carIdNew = $set[carIdField] ?? update[carIdField];
            const carIdInFilter = this.getQuery()?.[carIdField];
            const carIdToUse = carIdNew ?? carIdInFilter;
            if (!carIdToUse) return next();

            const car = await fetchCar(carIdToUse);
            if (!car) return next();

            update.$set = update.$set || {};
            // update.$set[fixedField] = FIXED_MARGIN;
            const { fixedMargin } = await getMargins(0);
            update.$set[fixedField] = fixedMargin;

            if (car?.[variableField] != null && car[variableField] !== 0) {
                update.$set[variableField] = car[variableField];
            } else if (car?.priceDiscovery != null) {
                // update.$set[variableField] = getMargins(car.priceDiscovery).variableMargin;
                const { variableMargin } = await getMargins(car.priceDiscovery);
                update.$set[variableField] = variableMargin;
            }

            this.setUpdate(update);
            next();
        } catch (e) {
            next(e);
        }
    });
}

module.exports = applySoldCarMarginsFromCar;
