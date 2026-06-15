const Counter = require("../Models/counterModel");

function selfInspectedCarInspectionIdGeneratePlugin(schema, options = {}) {
    const field = options.field || "inspectionId";
    const counterPrefix = options.counterPrefix || "selfInspectedCarInspectionId";

    const MAX_TRIES = 10;

    async function syncCounterToLatest(model, yy, counterKey) {
        // Match format: SI-26-1000001
        const regex = new RegExp(`^SI-${yy}-\\d{7}$`);

        const lastDoc = await model
            .findOne(
                { [field]: regex },
                { [field]: 1 }
            )
            .sort({ [field]: -1 })
            .lean();

        if (!lastDoc?.[field]) return;

        // SI-26-1000230
        const parts = lastDoc[field].split("-");

        if (parts.length !== 3) return;

        const numericPart = parseInt(parts[2], 10);

        // convert 1000230 -> 230
        const seq = numericPart - 1000000;

        if (seq > 0) {
            await Counter.findOneAndUpdate(
                { _id: counterKey },
                { $max: { seq } },
                {
                    upsert: true,
                    setDefaultsOnInsert: true,
                }
            );
        }
    }

    schema.pre("validate", async function (next) {
        try {
            if (!this.isNew) return next();

            // 2026 -> 26
            const yy = String(new Date().getFullYear() % 100).padStart(2, "0");

            const counterKey = `${counterPrefix}_${yy}`;

            // If inspectionId already provided manually
            if (this[field]) {
                const exists = await this.constructor.exists({
                    [field]: this[field],
                });

                if (!exists) return next();

                // duplicate found -> regenerate
                this[field] = undefined;
            }

            // Sync counter with latest DB value
            await syncCounterToLatest(
                this.constructor,
                yy,
                counterKey
            );

            // Generate new IDs
            for (let i = 0; i < MAX_TRIES; i++) {

                const counterDoc = await Counter.findOneAndUpdate(
                    { _id: counterKey },
                    { $inc: { seq: 1 } },
                    {
                        new: true,
                        upsert: true,
                        setDefaultsOnInsert: true,
                    }
                );

                // 1 -> 1000001
                const runningNumber = 1000000 + counterDoc.seq;

                // Final format:
                // SI-26-1000001
                const candidate = `SI-${yy}-${runningNumber}`;

                const exists = await this.constructor.exists({
                    [field]: candidate,
                });

                if (!exists) {
                    this[field] = candidate;
                    return next();
                }
            }

            return next(
                new Error(
                    "Could not generate unique inspectionId."
                )
            );

        } catch (err) {
            console.log(
                "Error in selfInspectedCarInspectionIdGeneratePlugin:",
                err
            );

            return next(err);
        }
    });
}

module.exports = selfInspectedCarInspectionIdGeneratePlugin;