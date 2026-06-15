
// Controller/user_activity_logs_controller.js

const UserActivityLogsModel = require('../Models/userActivityLogsModel');

// Add User Activity Log
exports.addUserActivityLog = async (req, res) => {

    try {
        const { userId, event, eventDetails, appName, appVersion, metadata } = req.body;

        const safeUserId = String(userId || '').trim();
        const safeEventName = String(event || '').trim();

        if (!safeUserId || !safeEventName) {
            return res.status(400).json({ error: 'User ID and Event name are required' });
        }

        const log = await UserActivityLogsModel.create({
            userId: safeUserId,
            event: safeEventName,
            eventDetails: String(eventDetails || '').trim(),
            appName: String(appName || '').trim(),
            appVersion: String(appVersion || '').trim(),
            metadata:
                metadata && typeof metadata === 'object' && !Array.isArray(metadata)
                    ? metadata
                    : {},
        });

        return res.status(200).json({
            success: true,
            message: 'User activity log added successfully',
            data: {
                  id: log._id.toString(),
                userId: log.userId,
                event: log.event,
                eventDetails: log.eventDetails,
                appName: log.appName,
                appVersion: log.appVersion,
                metadata: log.metadata,
                createdAt: log.createdAt,
            },
        });
    } catch (error) {
        console.error('addUserActivityLog error:', error);
       return res.status(500).json({
      success: false,
      message: error?.message || 'Internal Server Error',
      });
    }
};




// Save App Version When User Opens The App
exports.saveAppVersionOnAppLaunch = async (req, res) => {
  try {
    const { userId, event, eventDetails, appName, appVersion, metadata } = req.body;

     const safeUserId = String(userId || '').trim();
        const safeEventName = String(event || '').trim();

        if (!safeUserId || !safeEventName) {
      return res.status(400).json({ error: 'User ID and Event name are required' });
    }

    const filter = {
      userId: safeUserId,
      event: safeEventName,
      appName: String(appName || '').trim(),
      appVersion: String(appVersion || '').trim(),
    };

    const update = {
      eventDetails: String(eventDetails || '').trim(),
      // Optional: keep these consistent even if client sends messy values
      event: filter.event,
      appVersion: filter.appVersion,
      userId: filter.userId,
      appName: filter.appName,
      metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata)
                ? metadata
                : {},
      lastUpdatedAt: new Date(),
    };

    // If your schema has timestamps: true, updatedAt will auto-update.
    // If not, you can manually set it:
    // update.updatedAt = new Date();

    const log = await UserActivityLogsModel.findOneAndUpdate(
      filter,
      { $set: update },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        id: log._id.toString(),
        userId: log.userId.toString(),
        event: log.event,
        eventDetails: log.eventDetails,
        appName: log.appName,
        appVersion: log.appVersion,
        metadata: log.metadata,
        createdAt: log.createdAt,
        lastUpdatedAt: log.lastUpdatedAt,
      },
    });
  } catch (error) {
    console.error('saveAppVersionOnAppLaunch error:', error);
   return res.status(500).json({
      success: false,
      message: error?.message || 'Internal Server Error',
      });
  }
};


