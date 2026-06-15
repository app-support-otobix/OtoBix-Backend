const Counter = require("../Models/counterModel");

function appointmentIdPlugin(schema, options = {}) {
    const field = options.field || "appointmentId";
    const counterPrefix = options.counterPrefix || "appointmentId";
    const MAX_TRIES = 10;

    async function syncCounterToLatest(model, yy, counterKey) {
        // appointmentId format: "26-100021"
        const regex = new RegExp(`^${yy}-\\d{6}$`);

        const lastDoc = await model
            .findOne({ [field]: regex }, { [field]: 1 })
            .sort({ [field]: -1 }) // works because fixed-length numeric part
            .lean();

        if (!lastDoc?.[field]) return;

        const six = parseInt(String(lastDoc[field]).split("-")[1], 10); // 100021
        const seq = six - 100000; // 21

        if (seq > 0) {
            await Counter.findOneAndUpdate(
                { _id: counterKey },
                { $max: { seq } },
                { upsert: true, setDefaultsOnInsert: true }
            );
        }
    }

    schema.pre("validate", async function (next) {
        try {
            if (!this.isNew) return next();

            const yy = String(new Date().getFullYear() % 100).padStart(2, "0");
            const counterKey = `${counterPrefix}_${yy}`;

            // If client provided appointmentId, keep it only if unique; otherwise generate
            if (this[field]) {
                const exists = await this.constructor.exists({ [field]: this[field] });
                if (!exists) return next();
                this[field] = undefined; // duplicate -> auto-generate
            }

            // ✅ 1) Sync counter to latest existing appointmentId (fixes "counter behind")
            await syncCounterToLatest(this.constructor, yy, counterKey);

            // ✅ 2) Generate next ids (small retry for concurrency)
            for (let i = 0; i < MAX_TRIES; i++) {
                const counterDoc = await Counter.findOneAndUpdate(
                    { _id: counterKey },
                    { $inc: { seq: 1 } },
                    { new: true, upsert: true, setDefaultsOnInsert: true }
                );

                const sixDigits = String(100000 + counterDoc.seq).padStart(6, "0");
                const candidate = `${yy}-${sixDigits}`;

                const exists = await this.constructor.exists({ [field]: candidate });
                if (!exists) {
                    this[field] = candidate;
                    return next();
                }
            }

            return next(new Error("Could not generate unique appointmentId. Try again."));
        } catch (err) {
            console.log("Error in appointmentIdPlugin:", err);
            return next(err);
        }
    });
}

module.exports = appointmentIdPlugin;



// const Counter = require("../Models/counterModel");

// function appointmentIdPlugin(schema, options = {}) {
//     const field = options.field || "appointmentId";
//     const counterPrefix = options.counterPrefix || "appointmentId";

//     schema.pre("validate", async function (next) {
//         try {
//             if (!this.isNew || this[field]) return next();

//             const yy = String(new Date().getFullYear() % 100).padStart(2, "0");
//             const counterKey = `${counterPrefix}_${yy}`;

//             const counterDoc = await Counter.findOneAndUpdate(
//                 { _id: counterKey },
//                 { $inc: { seq: 1 } },
//                 { new: true, upsert: true, setDefaultsOnInsert: true }
//             );

//             const numeric = 100000 + counterDoc.seq; // seq=1 => 100001
//             const sixDigits = String(numeric).padStart(6, "0");

//             this[field] = `${yy}-${sixDigits}`;
//             return next();
//         } catch (err) {
//             console.log("Error in appointmentIdPlugin:", err);
//             return next(err);
//         }
//     });
// }

// module.exports = appointmentIdPlugin;
