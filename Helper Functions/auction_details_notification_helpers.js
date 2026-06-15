
// auction_details_notification_helpers.js

const mongoose = require('mongoose');
const CarModel = require('../Models/carModel');
const BidModel = require('../Models/bidModel');
const { getCustomerIdByPhoneNumber } = require('./external_id_extraction_helpers');
const { sendPushToExternalId } = require('../Helper Functions/send_notification_helpers');

function buildCarIdMatchers(carId) {
    const ids = new Set();

    if (carId) ids.add(String(carId));

    if (carId && mongoose.Types.ObjectId.isValid(String(carId))) {
        ids.add(new mongoose.Types.ObjectId(String(carId)));
    }
    return Array.from(ids);
}

async function notifyCustomerAndBiddersOnExpectedPriceUpdate({ carId, newExpectedPrice }) {
    if (!carId || newExpectedPrice === undefined || newExpectedPrice === null) return;

    const car = await CarModel.findById(carId)
        .select('contactNumber make model')
        .lean();

    if (!car) return;

    // customer external id (from phone)
    const customerExternalId = await getCustomerIdByPhoneNumber(car.contactNumber);

    // unique bidders
    const carIdMatchers = buildCarIdMatchers(carId);

    const bidderIds = await BidModel.distinct('userId', {
        carId: { $in: carIdMatchers },
    });

    const uniqueBidderIds = Array.from(
        new Set((bidderIds || []).map(id => String(id)).filter(Boolean))
    ).filter(id => !customerExternalId || id !== String(customerExternalId));

    const carName = (!car.make || !car.model) ? 'car' : `${car.make} ${car.model}`.trim();

    // 1) Notify customer
    if (customerExternalId) {
        await sendPushToExternalId({
            externalId: String(customerExternalId),
            title: 'CEP Revised',
            body: `Your expected & reserve price has been updated to ₹${newExpectedPrice.toLocaleString('en-IN')}/- for ${carName}.`,
            data: { carId: String(carId) },
        });
    }

    // 2) Notify bidders
    for (const externalId of uniqueBidderIds) {
        await sendPushToExternalId({
            externalId: String(externalId),
            title: 'CEP Revised',
            body: `The deal price for ${carName} has been revised. Pls check and bid to win the car`,
            data: { carId: String(carId) },
        });
    }
}

module.exports = {
    notifyCustomerAndBiddersOnExpectedPriceUpdate,
};
