// constants.js

module.exports = {
    // App Config
    APP_NAME: 'Otobix',
    PORT: process.env.PORT || 3000,

    // User Roles
    USER_ROLES: {
        ADMIN: 'Admin',
        DEALER: 'Dealer',
        CUSTOMER: 'Customer',
        INSPECTION_ENGINEER: 'Inspection Engineer',
        SALES_MANAGER: 'Sales Manager',
        RETAILER: 'Retailer',
        TELECALLER: 'Telecaller',
        QC: 'QC',
        DEALER_AS_SELLER: 'Dealer (Seller)',
    },

    // Auction Statuses
    AUCTION_STATUS: {
        UPCOMING: 'upcoming',
        LIVE: 'live',
        OTOBUY: 'otobuy',
        LIVEAUCTIONENDED: 'liveAuctionEnded',
        SOLD: 'sold',
        REMOVED: 'removed',
        // OTOBUYENDED: 'otobuyEnded',
        // MARKETPLACE: 'marketplace',
        // INSPECTED: 'inspected',
    },

    // Self Inspection Auction Statuses
    SELF_INSPECTED_CARS_AUCTION_STATUS: {
        SELF_INSPECTED: 'selfInspected',     // Seller submitted car
        INSPECTION_UNDER_REVIEW: 'inspectionUnderReview', // QC is reviewing
        INSPECTION_APPROVED: 'inspectionApproved',       // QC approved car
        LIVE_FOR_BIDDING: 'liveForBidding',              // Visible in Dealer App PD tab
        BIDDING_ENDED: 'biddingEnded',                  // 24h passed
        OFFER_ACCEPTED: 'offerAccepted',                // Owner accepted an offer and scheduled full inspection
        INSPECTION_REJECTED: 'inspectionRejected',       // QC rejected car
        MOVED_TO_MARKETPLACE: 'movedToMarketplace',     // Owner chose marketplace
    },

    // Notification Routes
    NOTIFICATION_ROUTES: {
        CAR_ADDED_IN_UPCOMING: 'carAddedInUpcoming',
        CAR_ADDED_IN_LIVE: 'carAddedInLive',
        CAR_ADDED_IN_OTOBUY: 'carAddedInOtobuy',
        USER_OUTBID_ON_CAR: 'userOutbidOnCar',
        CAR_ADDED_IN_PD: 'carAddedInPd',
    },

    // Home screen sections in flutter
    HOME_SCREEN_SECTIONS: {
        LIVE_BIDS_SECTION_SCREEN: 'live_bids',
        UPCOMING_SECTION_SCREEN: 'upcoming',
        OTOBUY_SECTION_SCREEN: 'otobuy',
        PD_SECTION_SCREEN: 'pd',
        // MARKETPLACE_SECTION_SCREEN: 'marketplace',
    },

    // Approval Statuses
    APPROVAL_STATUS: {
        APPROVED: 'Approved',
        REJECTED: 'Rejected',
        PENDING: 'Pending',
    },


    // Banner Statuses
    BANNER_STATUS: {
        ACTIVE: 'Active',
        INACTIVE: 'Inactive',
    },

    // Banner Types
    BANNER_TYPES: {
        HEADER: 'Header',
        FOOTER: 'Footer',
    },

    // Banner Views
    BANNER_VIEWS: {
        SELL_MY_CAR: 'Sell My Car',
        HOME: 'Home',
    },

    // User Permissions
    USER_PERMISSIONS: {
        VIEW_HOME: 'view_home',
        VIEW_ADMIN: 'view_admin',
        VIEW_LEADS: 'view_leads',
        VIEW_INSPECTION: 'view_inspection',
        VIEW_PRICE_DISCOVERY: 'view_price_discovery',
        VIEW_AUCTION: 'view_auction',
    },

    // Payment Statuses
    PAYMENT_STATUS: {
        ORDER_CREATED: 'order-created',
        CAPTURED: 'captured',
        AUTHORIZED: 'authorized',
        FAILED: 'failed',
        REFUNDED: 'refunded',
    },

    // Default Messages
    MESSAGES: {
        SERVER_ERROR: 'Something went wrong. Please try again later.',
        UNAUTHORIZED: 'You are not authorized to perform this action.',
        NOT_FOUND: 'Resource not found.',
        VALIDATION_ERROR: 'Validation failed.',
        SUCCESS: 'Operation successful.',
    },

    // Regex Patterns
    REGEX: {
        EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        PHONE: /^[0-9]{10,15}$/,
    },

    // API Response Keys
    RESPONSE: {
        SUCCESS: 'success',
        ERROR: 'error',
        MESSAGE: 'message',
        DATA: 'data',
    },

    // Agenda jobs
    AGENDA_JOBS: {
        MOVE_CAR_FROM_UPCOMING_TO_LIVE: 'move-car-from-upcoming-to-live',
        START_LIVE_AUCTION: 'start-live-auction',
        END_LIVE_AUCTION: 'end-live-auction',
        MOVE_CAR_FROM_OTOBUY_TO_AUCTION_COMPLETED: 'move-car-from-otobuy-to-auction-completed',
        NOTIFY_CUSTOMER_EVERY_SIX_HOURS_IF_CAR_IS_LIVE: 'notify-customer-every-six-hours-if-car-is-live',
        NOTIFY_CUSTOMER_10_MINS_BEFORE_AUCTION_END_IF_CAR_IS_LIVE: 'notify-customer-10-mins-before-auction-end-if-car-is-live',
        CHECK_SERVICE_HISTORY_REPORT_STATUS: 'check-service-history-report-status',
        SCHEDULE_SELF_INSPECTED_CAR_AUCTION: 'schedule-self-inspected-car-auction',
    }
};
