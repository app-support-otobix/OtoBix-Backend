// const { firebaseService, toStringMap } = require('../Config/firebase_service');

// // POST /notify/token
// async function sendToToken(req, res) {
//     try {
//         const { token, title = 'Otobix', body = 'Test notification', data = {} } = req.body || {};
//         if (!token) return res.status(400).json({ error: 'token is required' });

//         const message = {
//             token,
//             notification: { title, body },
//             data: toStringMap(data),
//             android: {
//                 priority: 'high',
//                 notification: { channelId: 'high_importance_channel' },
//             },
//             apns: { payload: { aps: { sound: 'default' } } },
//         };

//         const id = await firebaseService.messaging().send(message);
//         return res.json({ id });
//     } catch (e) {
//         return res.status(500).json({ error: e.message });
//     }
// }

// // POST /notify/topic
// async function sendToTopic(req, res) {
//     try {
//         const { topic = 'all', title = 'Otobix', body = 'Hello everyone', data = {} } = req.body || {};

//         const message = {
//             topic,
//             notification: { title, body },
//             data: toStringMap(data),
//             android: {
//                 priority: 'high',
//                 notification: { channelId: 'high_importance_channel' },
//             },
//             apns: { payload: { aps: { sound: 'default' } } },
//         };

//         const id = await firebaseService.messaging().send(message);
//         return res.json({ id });
//     } catch (e) {
//         return res.status(500).json({ error: e.message });
//     }
// }

// // POST /topic/subscribe
// async function subscribeToken(req, res) {
//     try {
//         const { token, topic = 'all' } = req.body || {};
//         if (!token) return res.status(400).json({ error: 'token is required' });

//         const out = await firebaseService.messaging().subscribeToTopic([token], topic);
//         return res.json(out);
//     } catch (e) {
//         return res.status(500).json({ error: e.message });
//     }
// }

// module.exports = {
//     sendToToken,
//     sendToTopic,
//     subscribeToken,
// };
