// controllers/notificationsController.js
const NotificationsModel = require('../Models/userNotificationsModel');
const EVENTS = require('../Sockets/socket_events');
const socketService = require('../Config/socket_service');
// Create notification
exports.createNotification = async (req, res) => {
    try {
        const { userId, title, body, type = 'info', data = {},
            // NEW:
            isGlobal = false,
        } = req.body;
        if (!userId || !title || !body) return res.status(400).json({ error: 'userId, title, body are required' });

        const doc = await NotificationsModel.create({ userId, title, body, type, data, isGlobal });

        // Get unread notifications count
        const unreadNotificationsCount = await NotificationsModel.countDocuments({
            userId,
            isRead: false
        });

        // 🔊 Emit to that user notifications room
        socketService.emitToRoom(
            EVENTS.USER_NOTIFICATIONS_ROOM + userId,
            EVENTS.USER_NOTIFICATION_CREATED,
            {
                // keep payload small but useful
                item: {
                    _id: doc._id,
                    userId: doc.userId,
                    title: doc.title,
                    body: doc.body,
                    type: doc.type,
                    data: doc.data,
                    isRead: doc.isRead,
                    createdAt: doc.createdAt
                },
                unreadNotificationsCount
            }
        );

        res.json({ success: true, id: doc._id });
    } catch (e) {
        console.error('createNotification', e);
        res.status(500).json({ error: 'Server error' });
    }
};

// Notifications list
exports.notificationsList = async (req, res) => {
    try {
        const { userId, page, limit } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId is required' });

        const pageNumber = Math.max(parseInt(page || '1', 10), 1);
        const limitNumber = Math.min(Math.max(parseInt(limit || '20', 10), 1), 100);

        const [items, total] = await Promise.all([
            NotificationsModel.find({ userId }).sort({ createdAt: -1 }).skip((pageNumber - 1) * limitNumber).limit(limitNumber).lean(),
            NotificationsModel.countDocuments({ userId }),
        ]);

        const unreadCount = await NotificationsModel.countDocuments({ userId, isRead: false });

        res.json({ success: true, items, total, unreadCount, pageNumber, limitNumber });
    } catch (e) {
        console.error('listNotifications', e);
        res.status(500).json({ error: 'Server error' });
    }
};

// Full notification details
exports.notificationDetails = async (req, res) => {
    try {
        const { userId, notificationId } = req.query;
        if (!userId || !notificationId) return res.status(400).json({ error: 'userId and notificationId are required' });

        const doc = await NotificationsModel.findOne({ _id: notificationId, userId }).lean();
        if (!doc) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, item: doc });
    } catch (e) {
        console.error('notificationFullDetails', e);
        res.status(500).json({ error: 'Server error' });
    }
};

// Mark notification as read
exports.markNotificationAsRead = async (req, res) => {
    try {
        const { userId, notificationId } = req.body;
        if (!userId || !notificationId) return res.status(400).json({ error: 'userId and notificationId are required' });

        await NotificationsModel.updateOne({ _id: notificationId, userId }, { $set: { isRead: true } });

        // Get unread notifications count
        const unreadNotificationsCount = await NotificationsModel.countDocuments({
            userId,
            isRead: false
        });

        // 🔊 Emit to that user notifications room
        socketService.emitToRoom(
            EVENTS.USER_NOTIFICATIONS_ROOM + userId,
            EVENTS.USER_NOTIFICATION_MARKED_AS_READ,
            {
                unreadNotificationsCount,
                message: notificationId + ' marked as read',
            }
        );

        res.json({ success: true });
    } catch (e) {
        console.error('markNotificationAsRead', e);
        res.status(500).json({ error: 'Server error' });
    }
};

// Mark all notifications as read
exports.markAllNotificationsAsRead = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId is required' });
        await NotificationsModel.updateMany({ userId, isRead: false }, { $set: { isRead: true } });

        // Get unread notifications count
        const unreadNotificationsCount = await NotificationsModel.countDocuments({
            userId,
            isRead: false
        });

        // 🔊 Emit to that user notifications room
        socketService.emitToRoom(
            EVENTS.USER_NOTIFICATIONS_ROOM + userId,
            EVENTS.USER_ALL_NOTIFICATIONS_MARKED_AS_READ,
            {
                unreadNotificationsCount,
                message: 'All notifications marked as read',
            }
        );

        res.json({ success: true });
    } catch (e) {
        console.error('markAllNotificationsAsRead', e);
        res.status(500).json({ error: 'Server error' });
    }
};


exports.getUnreadNotificationsCount = async (req, res) => {
    try {
        const { userId } = req.query; // or req.params / req.body if you prefer
        if (!userId) return res.status(400).json({ error: 'userId is required' });

        const unreadCount = await NotificationsModel.countDocuments({ userId, isRead: false });
        return res.json({ success: true, unreadCount });
    } catch (err) {
        console.error('getUnreadNotificationsCount error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};