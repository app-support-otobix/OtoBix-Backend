// routes/notifications.js
const router = require('express').Router();
const authMiddleware = require("../Middlewares/auth_middleware");

const { createNotification, notificationsList, notificationDetails, markNotificationAsRead, markAllNotificationsAsRead, getUnreadNotificationsCount } = require('../Controllers/user_notifications_controller');


// Everything below this line is authenticated (protected routes)
// router.use(authMiddleware);

router.post('/create-notification', createNotification);
router.get('/notifications-list', notificationsList);
router.get('/notification-details', notificationDetails);
router.post('/mark-notification-as-read', markNotificationAsRead);
router.post('/mark-all-notifications-as-read', markAllNotificationsAsRead);
router.get('/get-unread-notifications-count', getUnreadNotificationsCount);


module.exports = router;
