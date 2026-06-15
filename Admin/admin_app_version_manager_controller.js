const AppVersionManager = require("../Models/appVersionManagerModel");

// 1) GET - Fetch all docs
exports.fetchAppVersions = async (req, res) => {
    try {
        const versionsList = await AppVersionManager.find().sort({ updatedAt: -1 });
        return res.status(200).json({
            success: true,
            count: versionsList.length,
            data: versionsList,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error fetching app versions",
            error: error.message,
        });
    }
};

// 2) POST - Add new doc
exports.addAppVersion = async (req, res) => {
    try {
        const { appKey, android, ios, enabled } = req.body;

        if (!appKey || !android || !ios) {
            return res.status(400).json({
                success: false,
                message: "appKey, android, ios are required",
            });
        }

        // prevent duplicate appKey
        const exists = await AppVersionManager.findOne({ appKey });
        if (exists) {
            return res.status(400).json({
                success: false,
                message: `appKey '${appKey}' already exists`,
            });
        }

        const doc = await AppVersionManager.create({
            appKey,
            android,
            ios,
            enabled: enabled ?? true,
        });

        return res.status(200).json({
            success: true,
            message: "App version added successfully",
            data: doc,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error adding app version",
            error: error.message,
        });
    }
};

// 3) PUT - Update existing doc by ID
exports.updateAppVersion = async (req, res) => {
    try {
        const { id } = req.body;

        const updatedDoc = await AppVersionManager.findByIdAndUpdate(
            id,
            { $set: req.body },
            { new: true }
        );

        if (!updatedDoc) {
            return res.status(404).json({
                success: false,
                message: "Document not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "App version updated successfully",
            data: updatedDoc,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error updating app version",
            error: error.message,
        });
    }
};

// 4) DELETE - Delete doc by ID
exports.deleteAppVersion = async (req, res) => {
    try {
        const { id } = req.body;

        const deletedDoc = await AppVersionManager.findByIdAndDelete(id);

        if (!deletedDoc) {
            return res.status(404).json({
                success: false,
                message: "Document not found",
            });
        }

        return res.status(200).json({
            success: true,
            message: "App version deleted successfully",
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error deleting app version",
            error: error.message,
        });
    }
};




// 5) GET - Fetch app update 
exports.fetchAppUpdateInfo = async (req, res) => {
    try {
        const { appKey } = req.query;

        // 1) Validate query param
        if (!appKey) {
            return res.status(400).json({
                success: false,
                message: "appKey is required in query params",
            });
        }

        // 2) Fast query: lean + exclude extra fields (optional)
        // If you truly want the "complete doc", remove .select(...) line.
        const doc = await AppVersionManager.findOne({ appKey })
            .lean()
            .select("-__v"); // optional: drop __v

        // 3) Not found handling
        if (!doc) {
            return res.status(404).json({
                success: false,
                message: "No app configuration found for this appKey",
            });
        }

        // Optional: if you don't want to show app update dialog when enabled is false
        if (!doc.enabled) {
            return res.status(400).json({
                success: false,
                message: "App update dialog is disabled",
            });
        }

        // 4) Light response
        return res.status(200).json({
            success: true,
            data: doc,
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Error fetching app update info",
            error: error.message,
        });
    }
};