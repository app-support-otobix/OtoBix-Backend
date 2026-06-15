// Admin/admin_car_margins_controller.js

const CarMarginsModel = require("../Models/carMarginsModel");
const mongoose = require("mongoose");
const { clearMarginsCache } = require("../Helper Functions/car_margin_helper");

const isValidRanges = (ranges) => {
    if (!Array.isArray(ranges)) return false;
    for (const r of ranges) {
        if (
            typeof r?.min !== "number" ||
            typeof r?.max !== "number" ||
            typeof r?.margin !== "number"
        )
            return false;
        if (r.min < 0) return false;
        if (r.max <= r.min) return false;
    }
    return true;
};

// ======================= Fetch Margins =======================
exports.fetchMarginsList = async (req, res) => {
    try {
        // You only expect 1 doc, but returning list is fine.
        const margins = await CarMarginsModel.find().lean();

        return res.status(200).json({
            success: true,
            data: margins,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error fetching car margins",
            error: error.message,
        });
    }
};




// ======================= Update Margin (merge) =======================
exports.updateMargin = async (req, res) => {
    try {
        const { _id, id, fixedMargin, variableRanges } = req.body;
        const docId = _id || id;

        if (!docId || !mongoose.isValidObjectId(docId)) {
            return res.status(400).json({
                success: false,
                message: "Valid _id (or id) is required.",
            });
        }

        const doc = await CarMarginsModel.findById(docId);
        if (!doc) {
            return res.status(404).json({
                success: false,
                message: "Margin document not found.",
            });
        }

        let changed = false;

        // ---------- fixedMargin ----------
        if (fixedMargin !== undefined) {
            if (typeof fixedMargin !== "number") {
                return res.status(400).json({
                    success: false,
                    message: "fixedMargin must be a number.",
                });
            }

            if (doc.fixedMargin !== fixedMargin) {
                doc.fixedMargin = fixedMargin;
                changed = true;
            }
        }

        // ---------- variableRanges (merge + add new) ----------
        if (variableRanges !== undefined) {
            if (!isValidRanges(variableRanges)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "variableRanges must be an array of {min,max,margin} numbers and max must be > min.",
                });
            }

            // Map existing subdocs by _id (string)
            const existingById = new Map(
                (doc.variableRanges || []).map((r) => [String(r._id), r])
            );

            for (const incoming of variableRanges) {
                const incomingId = incoming?._id ? String(incoming._id) : null;

                // 1) If incoming has _id and exists => update only if changed
                if (incomingId && existingById.has(incomingId)) {
                    const target = existingById.get(incomingId);

                    if (
                        target.min !== incoming.min ||
                        target.max !== incoming.max ||
                        target.margin !== incoming.margin
                    ) {
                        target.min = incoming.min;
                        target.max = incoming.max;
                        target.margin = incoming.margin;
                        changed = true;
                    }
                    continue;
                }

                // 2) Otherwise => new item => add it
                // If frontend sends an _id that doesn't exist in doc, we treat it as new.
                // Only keep that _id if it is a valid ObjectId; else let mongoose generate one.
                const toPush = {
                    min: incoming.min,
                    max: incoming.max,
                    margin: incoming.margin,
                };

                if (incomingId && mongoose.isValidObjectId(incomingId)) {
                    // avoid collision with an existing one (extra safety)
                    if (!existingById.has(incomingId)) {
                        toPush._id = incomingId;
                    }
                }

                doc.variableRanges.push(toPush);
                changed = true;
            }
        }

        if (!changed) {
            return res.status(200).json({
                success: true,
                message: "No changes detected.",
                data: doc.toObject(),
            });
        }

        await doc.save(); // triggers validators + updates updatedAt if schema has timestamps

        // ✅ clear in-memory cache so next request refetches fresh margins
        clearMarginsCache();

        return res.status(200).json({
            success: true,
            data: doc.toObject(),
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error updating margin",
            error: error.message,
        });
    }
};



// ======================= Delete Margin =======================
exports.deleteMargin = async (req, res) => {
    try {
        const { marginId } = req.body;

        if (!marginId) {
            return res.status(400).json({
                success: false,
                message: "marginId is required.",
            });
        }

        const deleted = await CarMarginsModel.findByIdAndDelete(marginId).lean();
        clearMarginsCache();

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Margin not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Margin deleted successfully.",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error deleting margin",
            error: error.message,
        });
    }
};
