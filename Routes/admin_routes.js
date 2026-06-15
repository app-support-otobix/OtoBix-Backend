// routes/admin_routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require("../Middlewares/auth_middleware");
const multer = require('multer');
// configure multer - this will store files in /uploads
// you can customize storage if you want
const upload = multer({ dest: 'uploads/' });

const { getDashboardReportsSummary, getDealersByMonths } = require('../Admin/admin_dashboard_controller');
const { getBidsSummary, getRecentBidsList } = require('../Admin/admin_bids_controller');
const { getCarsSummary, getCarsList, getHighestBidsOnCar, setCarVariableMargin } = require('../Admin/admin_cars_controller');
const { createKam, getAllKamsList, updateKam, deleteKam, assignKamToDealer } = require('../Admin/admin_kam_controller');
const { getCustomersSummary } = require('../Admin/admin_customers_controller');
const { getCarDropdownsList, addCarDropdown, editCarDropdown, deleteCarDropdown, toggleCarDropdownStatus } = require('../Admin/admin_customers_car_dropdowns_controller');
const { addBanner, fetchBannersList, deleteBanner, fetchBannersCount, updateBannerStatus } = require('../Admin/admin_banners_controller');
const { getDealersList } = require('../Admin/admin_dealers_controller');
const { fetchTeleCallingsList } = require('../Admin/admin_telecallings_controller');
const { fetchInterestedBuyersList } = require('../Admin/admin_interested_buyers_controller');
const { fetchAppVersions, addAppVersion, updateAppVersion, deleteAppVersion, fetchAppUpdateInfo } = require('../Admin/admin_app_version_manager_controller');

const { fetchMarginsList, updateMargin, deleteMargin } = require('../Admin/admin_car_margins_controller');

const { fetchAllDropdownsList, addOrUpdateDropdown, deleteDropdown } = require('../Admin/admin_dropdowns_controller');

// const { requireApiKey, copyDevDbCollectionAndPasteToProdDb } = require('../Utils/copy_dev_db_collection_and_paste_to_prod_db');

const { createUserThroughAdmin } = require('../Controllers/userController')

// To get from flutter app on start of app 
router.get('/get-app-update-info', fetchAppUpdateInfo);


// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);

router.get('/bids/summary', getBidsSummary);
router.get('/bids/recent-bids-list', getRecentBidsList);

router.get('/dashboard/get-reports-summary', getDashboardReportsSummary);
router.get('/dashboard/get-dealers-by-months', getDealersByMonths);

router.get('/cars/get-summary-counts', getCarsSummary);
router.get('/cars/get-cars-list', getCarsList);
router.post('/cars/get-highest-bids-on-car', getHighestBidsOnCar);
router.post('/cars/set-variable-margin', setCarVariableMargin);

router.post('/kams/create', createKam);
router.get('/kams/get-list', getAllKamsList);
router.put('/kams/update', updateKam);
router.post('/kams/delete', deleteKam);
router.post('/kams/assign-to-dealer', assignKamToDealer);

router.get('/customers/get-summary-counts', getCustomersSummary);

router.get('/customers/car-dropdowns/get-list', getCarDropdownsList);
router.post('/customers/car-dropdowns/add', addCarDropdown);
router.put('/customers/car-dropdowns/edit', editCarDropdown);
router.delete('/customers/car-dropdowns/delete', deleteCarDropdown);
router.put('/customers/car-dropdowns/toggle-status', toggleCarDropdownStatus);

router.post('/banners/add', upload.single('file'), addBanner);
router.post('/banners/get-list', fetchBannersList);
router.post('/banners/delete', deleteBanner);
router.post('/banners/get-count', fetchBannersCount);
router.post('/banners/update-status', updateBannerStatus);

router.get('/dealers/get-approved-dealers-list', getDealersList);

router.get('/telecallings/get-list', fetchTeleCallingsList);

router.get('/interested-buyers/get-list', fetchInterestedBuyersList);

router.get('/app-versions/get-list', fetchAppVersions);
router.post('/app-versions/add', addAppVersion);
router.put('/app-versions/update', updateAppVersion);
router.delete('/app-versions/delete', deleteAppVersion);

router.get('/car-margins/get-list', fetchMarginsList);
router.put('/car-margins/update', updateMargin);
router.delete('/car-margins/delete', deleteMargin);

router.get('/dropdowns/get-all-dropdowns-list', fetchAllDropdownsList);
router.post('/dropdowns/add-or-update', addOrUpdateDropdown);
router.delete('/dropdowns/delete', deleteDropdown);

router.post('/create-user-through-admin', createUserThroughAdmin);

// router.post('/copy-dev-db-collection-and-paste-to-prod-db', requireApiKey, copyDevDbCollectionAndPasteToProdDb);

module.exports = router;
