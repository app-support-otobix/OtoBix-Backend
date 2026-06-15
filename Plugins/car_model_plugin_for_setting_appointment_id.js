

// Plugins/car_model_plugin_for_setting_appointment_id.js

// Sets _id deterministically from appointmentId on create/insertMany and on upsert queries.
function appointmentIdToObjectIdPlugin(
    schema,
    {
        appointmentField = 'appointmentId',
        objectIdSetter, // required: (appointmentId) => ObjectId
    } = {}
) {
    if (typeof objectIdSetter !== 'function') {
        throw new Error('appointmentIdToObjectIdPlugin requires objectIdSetter');
    }

    // ✅ save / create(one)
    schema.pre('save', function (next) {
        if (!this._id && this[appointmentField]) {
            this._id = objectIdSetter(this[appointmentField]);
        }
        next();
    });

    // ✅ insertMany / create(array)
    schema.pre('insertMany', function (next, docs) {
        for (const doc of docs) {
            if (!doc._id && doc[appointmentField]) {
                doc._id = objectIdSetter(doc[appointmentField]);
            }
        }
        next();
    });

    // ✅ findOneAndUpdate with upsert:true
    schema.pre('findOneAndUpdate', function (next) {
        const update = this.getUpdate() || {};
        const opts = this.getOptions() || {};

        // Only needed when upserting (same intent as your previous hook)
        if (!opts.upsert) return next();

        const appt = update[appointmentField] || update.$set?.[appointmentField];
        if (appt && !update._id && !update.$set?._id) {
            const oid = objectIdSetter(appt);
            if (update.$set) update.$set._id = oid;
            else update._id = oid;
        }

        this.setUpdate(update);
        next();
    });

    // ✅ updateOne with upsert:true (recommended)
    schema.pre('updateOne', function (next) {
        const update = this.getUpdate() || {};
        const opts = this.getOptions() || {};

        if (!opts.upsert) return next();

        const appt = update[appointmentField] || update.$set?.[appointmentField];
        if (appt && !update._id && !update.$set?._id) {
            const oid = objectIdSetter(appt);
            if (update.$set) update.$set._id = oid;
            else update._id = oid;
        }

        this.setUpdate(update);
        next();
    });
}

module.exports = appointmentIdToObjectIdPlugin;
