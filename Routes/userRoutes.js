
const express = require("express");
const router = express.Router();

// Auth Middleware
const authMiddleware = require("../Middlewares/auth_middleware");

// Multer Middleware
const parser = require("../Middlewares/multer");

// Login Controller
const { login, loginOrRegisterUsingOtp } = require("../Controllers/login_controller");

// User Controller
const {
    register,
    getAllUsersList,
    getApprovedUsersList,
    getRejectedUsersList,
    getPendingUsersList,
    getUsersLength,
    updateUserStatus,
    logout,
    getUserStatusById,
    checkUsername,
    getUserProfile,
    updateUserProfile,
    updateUserThroughAdmin,
    setNewPassword
} = require("../Controllers/userController");

// User Wishlist Controller
const { addToWishlist, removeFromWishlist, getUserWishlist, getUserWishlistCarsList } = require("../Controllers/user_wishlist_controller");

// User My Bids Controller
const { addToMyBids, removeFromMyBids, getUserMyBids, getUserMyBidsCarsList, getUserBidsForCar } = require("../Controllers/user_my_bids_controller");

// User Purchased Cars Controller
const { addToPurchasedCars, getUserPurchasedCarsCount, getUserPurchasedCarsList } = require("../Controllers/user_purchased_cars_controller");

// User Activity Logs Controller
const { addUserActivityLog, saveAppVersionOnAppLaunch } = require("../Controllers/user_activity_logs_controller");

// Public Routes
router.post("/register", register);
router.post("/login", login);
router.post("/login-or-register-using-otp", loginOrRegisterUsingOtp);
router.put("/set-new-password", setNewPassword);
router.post("/check-username", checkUsername);
router.post("/add-user-activity-log", addUserActivityLog);
router.post("/save-app-version-on-app-launch", saveAppVersionOnAppLaunch);
router.get("/user-status/:id", getUserStatusById);

// Everything below this line is authenticated (protected routes)
router.use(authMiddleware);


// User Routes
router.get("/all-users-list", getAllUsersList);
router.get("/approved-users-list", getApprovedUsersList);
router.get("/rejected-users-list", getRejectedUsersList);
router.get("/pending-users-list", getPendingUsersList);
router.get("/users-length", getUsersLength);
router.put("/update-user-status/:id", updateUserStatus);
router.post("/logout/:id", logout);
router.get("/user-profile", getUserProfile);
router.put("/update-profile", parser.single('image'), updateUserProfile);
router.put("/update-user-through-admin", updateUserThroughAdmin);

// User Wishlist Routes
router.post("/add-to-wishlist", addToWishlist);
router.post("/remove-from-wishlist", removeFromWishlist);
router.get("/get-user-wishlist", getUserWishlist);
router.get("/get-user-wishlist-cars-list", getUserWishlistCarsList);

// User My Bids Routes
router.post("/add-to-my-bids", addToMyBids);
router.post("/remove-from-my-bids", removeFromMyBids);
router.get("/get-user-my-bids", getUserMyBids);
router.get("/get-user-my-bids-cars-list", getUserMyBidsCarsList);
router.get("/get-user-bids-for-car", getUserBidsForCar);

// User Purchased Cars Routes
router.post("/add-to-purchased-cars", addToPurchasedCars);
router.get("/get-user-purchased-cars-count", getUserPurchasedCarsCount);
router.get("/get-user-purchased-cars-list", getUserPurchasedCarsList);

module.exports = router;
