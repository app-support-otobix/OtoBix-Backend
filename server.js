// server.js  (CommonJS)
process.env.PLAYWRIGHT_BROWSERS_PATH = '0'; // Only for chromium playwright (service history files)
require('dotenv').config();
// require('dns').setServers(['1.1.1.1', '8.8.8.8']); // force DNS for Node SRV queries -> Temporary fix for MongoDB connection issue
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const os = require('os');
const http = require('http');
const path = require('path');

const connectDB = require('./Config/mongo_db');
const { initAgenda } = require('./Agenda/agenda'); 
const SocketService = require('./Config/socket_service');
const { saveAdminCredentialsInMongo } = require('./Utils/save_admin_credentials_in_mongo');
const { saveSalesManagerCredentialsInMongo } = require('./Utils/save_sales_manager_credentials_in_mongo');
const { saveRetailerCredentialsInMongo } = require('./Utils/save_retailer_credentials_in_mongo');
const { saveEntityDocumentsInMongo } = require('./Utils/save_entity_documents_in_mongo');
const { saveCarMarginsIfNotPresentInMongo } = require("./Utils/save_car_margins_if_not_present_in_mongo");


const app = express();
app.set('trust proxy', 1); // For trust proxy kong
const server = http.createServer(app);
SocketService.initialize(server);

const PORT = process.env.PORT || 4000;
const AUTO_PING_URL = process.env.AUTO_PING_URL;

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

// Main routes
app.use('/api/otp', require('./Routes/otpRoutes'));
app.use('/api/user', require('./Routes/userRoutes'));
app.use('/api/car', require('./Routes/carDetailsRoutes'));
app.use('/api/user/notifications', require('./Routes/userNotificationsRoutes'));
app.use('/api/upcoming', require('./Routes/upcoming_routes'));
app.use('/api/terms', require('./Routes/terms_and_conditions_routes'));
app.use('/api/privacy-policy', require('./Routes/privacy_policy_routes'));
app.use('/api/dealer-guide', require('./Routes/dealer_guide_routes'));
app.use('/api/otobuy', require('./Routes/otobuy_routes'));
app.use('/api/entity-documents', require('./Routes/entity_documents_routes'));
app.use('/api/admin', require('./Routes/admin_routes'));
app.use('/api/customer', require('./Routes/customer_routes'));
app.use('/api/inspection', require('./Routes/inspection_routes'));
app.use('/api/ewi', require('./Routes/ewi_routes'));
app.use('/api/razorpay', require('./Routes/razorpay_routes'));
app.use('/api/service-history', require('./Routes/service_history_routes'));
app.use('/api/self-inspection', require('./Routes/self_inspection_routes'));
app.use('/api/otobix', require('./Routes/otobix_routes'));
app.use('/api/tp', require('./Routes/third_party_routes'));
app.use("/api/mongodb", require('./Routes/mongo_db_backup_routes'));  // Backup and Restore rountes for MongoDB
app.use('/api/dummy', require('./Extra Files/dummy_routes'));

// Self Ping routes
const selfPing = require('./Extra Files/self_ping');
app.use('/api/ping', selfPing.ping);
selfPing.autoPing(AUTO_PING_URL);

// Extra routes
// app.use('/api/notifications', require('./Routes/send_notifications_routes'));
// app.use('/api', require('./Config/Import Appsheet Data/import_appsheet_data_to_mongodb'));
// app.use('/api', require('./Extra Files/extra_files_routes'));
// app.use('/api', require('./Extra Files/dummy_routes'));
// app.use('/api', require('./Utils/add_car_make_model_variant_in_mongo'));
// app.use('/api', require('./Utils/upload_sample_service_history_pdf'));
// app.get('/test', (req, res) =>
//   res.sendFile(path.join(__dirname, 'Controllers', 'dummy_browser_test.html'))
// );
// const fixCarDatesRouter = require('./Extra Files/dummy'); // path as you saved it
// app.use('/admin', fixCarDatesRouter);


app.get('/', (req, res) => res.send('Otobix server is running'));



const { sendPushToExternalId, sendPushToAllDealers, sendPushToAllCustomers, sendPushToAllInspectionEngineers } = require('./Helper Functions/send_notification_helpers');
app.post('/api/send-notification', async (req, res) => {
  try {
    const { externalId, title, body, data } = req.body;
    // Send to a specific user
    await sendPushToExternalId({
      externalId,
      title,
      body,
      data,
    });

    // // Send to all users
    // const CONSTANTS = require('./Utils/constants');
    // const Car = require('./Models/carModel');
    // const CarDetailsForCarsListModel = require('./Shared/car_details_for_cars_list_model');
    // const fresh = await Car.findById('bfcb376c49c7d91ffc82f917').lean();
    // const listing = CarDetailsForCarsListModel.setCarDetails(fresh);
    // await sendPushToAllDealers({
    //   title: 'New Test Upcoming Car 🚗',
    //   body: ` is now available in Upcoming Auctions!`,
    //   data: {
    //     carId: 'bfcb376c49c7d91ffc82f917',
    //     navigateToScreen: CONSTANTS.NOTIFICATION_ROUTES.CAR_ADDED_IN_UPCOMING,
    //     parametersForScreen: {
    //       carId: 'bfcb376c49c7d91ffc82f917',
    //       currentOpenSection: CONSTANTS.HOME_SCREEN_SECTIONS.UPCOMING_SECTION_SCREEN,
    //     }
    //   },
    // });

    res.json({ message: 'Notification sent successfully' });
  } catch (e) {
    console.error(e?.response?.data || e.message);
    res.status(500).json({ error: e?.response?.data || e.message });
  }
});

// ---- boot in async IIFE (no top-level await) ----
(async () => {
  try {
    await connectDB();
    await saveAdminCredentialsInMongo();
    await saveSalesManagerCredentialsInMongo();
    await saveRetailerCredentialsInMongo();
    await saveEntityDocumentsInMongo();
    await saveCarMarginsIfNotPresentInMongo();
    await initAgenda();

    server.listen(PORT, '0.0.0.0', () => {
      const ip = getLocalIP();
      console.log(`Server listening at:`);
      console.log(`→ http://localhost:${PORT}`);
      console.log(`→ http://${ip}:${PORT}  (use this on another PC)`);
    });
  } catch (err) {
    console.error('Boot error:', err);
    process.exit(1);
  }
})();

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name in interfaces) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}




// // Only for testing in browser
// const path = require('path');
// app.get('/test', (req, res) => {
//     res.sendFile(path.join(__dirname, 'Controllers', 'dummy_browser_test.html'));
// });
