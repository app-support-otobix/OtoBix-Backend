// Admin/admin_dropdowns_controller.js

const DropdownsModel = require("../Models/dropdownsModel");

// ======================= Fetch Dropdowns List (Alphabetical) =======================
exports.fetchAllDropdownsList = async (req, res) => {
    try {
        // const dropdowns = await DropdownsModel.find().sort({ dropdownName: 1 }); // A-Z
        const dropdowns = await DropdownsModel.find().sort({ updatedAt: -1 }); // Latest first

        res.status(200).json({
            success: true,
            data: dropdowns,
        });
    } catch (error) {
        console.error("Error fetching dropdowns:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching dropdowns",
            error: error.message,
        });
    }
};

// ======================= Add or Update Dropdown =======================
exports.addOrUpdateDropdown = async (req, res) => {
    try {
        let { dropdownId, dropdownNames, dropdownValues } = req.body;

        // ✅ normalize values (trim + remove empty + unique)
        if (Array.isArray(dropdownValues)) {
            dropdownValues = [
                ...new Set(dropdownValues.map((v) => String(v).trim()).filter(Boolean)),
            ];
        }

        // ✅ If dropdownId is given -> update that one doc only
        if (dropdownId) {
            // you said you will receive dropdownNames as list,
            // so we take the first one as the new name
            if (!Array.isArray(dropdownNames) || dropdownNames.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Dropdown names (list of strings) is required",
                });
            }

            const newName = String(dropdownNames[0]).replace(/\*/g, "").trim();
            if (!newName) {
                return res.status(400).json({
                    success: false,
                    message: "Valid dropdown name is required",
                });
            }

            if (!Array.isArray(dropdownValues)) {
                return res.status(400).json({
                    success: false,
                    message: "Dropdown values (list of strings) is required",
                });
            }

            const updated = await DropdownsModel.findByIdAndUpdate(
                dropdownId,
                { $set: { dropdownName: newName, dropdownValues } }, // ✅ only update these
                { new: true, runValidators: true }
            );

            if (!updated) {
                return res.status(404).json({
                    success: false,
                    message: "Dropdown not found",
                });
            }

            return res.status(200).json({
                success: true,
                message: "Dropdown updated successfully",
                data: updated,
            });
        }

        // ===================== Existing bulk logic (no dropdownId) =====================
        if (!Array.isArray(dropdownNames) || dropdownNames.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Dropdown names (list of strings) is required",
            });
        }

        if (!Array.isArray(dropdownValues)) {
            return res.status(400).json({
                success: false,
                message: "Dropdown values (list of strings) is required",
            });
        }

        // ✅ normalize dropdown names (remove * + trim + unique)
        dropdownNames = [
            ...new Set(
                dropdownNames
                    .map((n) => String(n).replace(/\*/g, "").trim())
                    .filter(Boolean)
            ),
        ];

        const ops = dropdownNames.map((name) => ({
            updateOne: {
                filter: { dropdownName: name },
                update: {
                    $setOnInsert: { dropdownName: name, isActive: true },
                    $set: { dropdownValues }, // replace
                },
                upsert: true,
            },
        }));

        const result = await DropdownsModel.bulkWrite(ops, { ordered: false });

        return res.status(200).json({
            success: true,
            message: "Dropdowns added/updated (values replaced) successfully",
            result,
        });
    } catch (error) {
        console.error("Bulk replace error:", error);

        // optional: handle duplicate dropdownName error nicely
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: "Dropdown name already exists",
            });
        }

        return res.status(500).json({
            success: false,
            message: "Error adding/updating dropdowns",
            error: error.message,
        });
    }
};



// ======================= Delete Dropdown =======================
exports.deleteDropdown = async (req, res) => {
    try {
        const { dropdownId } = req.body;

        const deleted = await DropdownsModel.findByIdAndDelete(dropdownId);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: "Dropdown not found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Dropdown deleted successfully",
        });
    } catch (error) {
        console.error("Error deleting dropdown:", error);
        res.status(500).json({
            success: false,
            message: "Error deleting dropdown",
            error: error.message,
        });
    }
};

// ======================= Fetch Single Dropdown By ID =======================
// params: /:id
exports.fetchDropdownById = async (req, res) => {
    try {
        const { dropdownId } = req.body;

        const dropdown = await DropdownsModel.findById(dropdownId);

        if (!dropdown) {
            return res.status(404).json({
                success: false,
                message: "Dropdown not found",
            });
        }

        res.status(200).json({
            success: true,
            data: dropdown,
        });
    } catch (error) {
        console.error("Error fetching dropdown:", error);
        res.status(500).json({
            success: false,
            message: "Error fetching dropdown",
            error: error.message,
        });
    }
};




// // ======================= Bulk Upsert Dropdowns =======================
// exports.bulkUpsertDropdowns = async (req, res) => {
//     try {
//         const payload = Array.isArray(req.body) ? req.body : req.body.dropdowns;

//         if (!Array.isArray(payload) || payload.length === 0) {
//             return res.status(400).json({
//                 success: false,
//                 message: "dropdowns array is required",
//             });
//         }

//         const ops = payload.map((d) => {
//             const dropdownName = String(d.dropdownName || "")
//                 .replace(/\*/g, "")
//                 .trim();

//             // ✅ read from d.values (your JSON) and store into dropdownValues (your schema)
//             const dropdownValues = Array.isArray(d.values)
//                 ? [...new Set(d.values.map((v) => String(v).trim()).filter(Boolean))]
//                 : [];

//             return {
//                 updateOne: {
//                     filter: { dropdownName },
//                     update: {
//                         $setOnInsert: {
//                             dropdownName,
//                             isActive: true,
//                         },
//                         // ✅ correct field name
//                         $addToSet: { dropdownValues: { $each: dropdownValues } },
//                     },
//                     upsert: true,
//                 },
//             };
//         });

//         const result = await DropdownsModel.bulkWrite(ops, { ordered: false });

//         return res.status(200).json({
//             success: true,
//             message: "Dropdowns imported successfully",
//             result,
//         });
//     } catch (error) {
//         console.error("Bulk import error:", error);
//         return res.status(500).json({
//             success: false,
//             message: "Error importing dropdowns",
//             error: error.message,
//         });
//     }
// };
