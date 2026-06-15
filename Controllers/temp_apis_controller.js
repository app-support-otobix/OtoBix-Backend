const CarModel = require("../Models/carModel");


// ======================= Fix Car Fields =======================
exports.fixCarFields = async (req, res) => {
    try {
        const { appointmentId } = req.body;

        // ======================= VALIDATION =======================
        if (!appointmentId) {
            return res.status(400).json({
                success: false,
                message: "Appointment ID is required",
            });
        }

        // ======================= FIND CAR =======================
        const car = await CarModel.findOne({ appointmentId });

        if (!car) {
            return res.status(404).json({
                success: false,
                message: "Car not found",
            });
        }

        // ======================= FIX apronLhsRhs =======================
        let apronLhsRhs = Array.isArray(car.apronLhsRhs)
            ? [...car.apronLhsRhs]
            : [];

        const lhsApronImages = Array.isArray(car.lhsApronImages)
            ? car.lhsApronImages
            : [];

        const rhsApronImages = Array.isArray(car.rhsApronImages)
            ? car.rhsApronImages
            : [];

        // If already has 2 items
        if (apronLhsRhs.length >= 2) {
            apronLhsRhs = apronLhsRhs.slice(0, 2);
        }

        // If has 1 item
        else if (apronLhsRhs.length === 1) {
            apronLhsRhs.push(
                lhsApronImages[0] ||
                rhsApronImages[0] ||
                "NA"
            );
        }

        // If empty
        else {
            apronLhsRhs = [
                lhsApronImages[0] || "NA",
                rhsApronImages[0] || "NA",
            ];
        }

        // Ensure exactly 2 items
        while (apronLhsRhs.length < 2) {
            apronLhsRhs.push("NA");
        }

        // ======================= FIX exhaustSmokeImages =======================
        let exhaustSmokeImages = Array.isArray(car.exhaustSmokeImages)
            ? [...car.exhaustSmokeImages]
            : [];

        const exhaustSmokeVideo = Array.isArray(car.exhaustSmokeVideo)
            ? car.exhaustSmokeVideo
            : [];

        if (exhaustSmokeImages.length === 0) {
            exhaustSmokeImages = [
                exhaustSmokeVideo[0] || "NA",
            ];
        }

        // Ensure exactly 1 item
        exhaustSmokeImages = [
            exhaustSmokeImages[0] || "NA",
        ];

        // ======================= FIX engineSound =======================
        let engineSound = Array.isArray(car.engineSound)
            ? [...car.engineSound]
            : [];

        const engineVideo = Array.isArray(car.engineVideo)
            ? car.engineVideo
            : [];

        if (engineSound.length === 0) {
            engineSound = [
                engineVideo[0] || "NA",
            ];
        }

        // Ensure exactly 1 item
        engineSound = [
            engineSound[0] || "NA",
        ];

        // ======================= UPDATE ONLY REQUIRED FIELDS =======================
        await CarModel.updateOne(
            { appointmentId },
            {
                $set: {
                    apronLhsRhs,
                    exhaustSmokeImages,
                    engineSound,
                },
            }
        );

        // ======================= RESPONSE =======================
        return res.status(200).json({
            success: true,
            message: "Fields fixed successfully",
            data: {
                apronLhsRhs,
                exhaustSmokeImages,
                engineSound,
            },
        });

    } catch (error) {
        console.error("fixCarFields Error:", error);

        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};