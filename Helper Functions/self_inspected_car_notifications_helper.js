
// Helper Functions/self_inspected_car_notifications_helper.js

const mongoose = require('mongoose');
const SelfInspectedCarsModel = require('../Models/selfInspectedCarsModel');
const SelfInspectedCarOffersModel = require('../Models/selfInspectedCarOffersModel');
const { getUserIdByPhoneNumber } = require('./external_id_extraction_helpers');
const { sendPushToExternalId } = require('./send_notification_helpers');

function buildCarIdMatchers(carId) {
    const ids = new Set();

    if (carId) ids.add(String(carId));

    if (carId && mongoose.Types.ObjectId.isValid(String(carId))) {
        ids.add(new mongoose.Types.ObjectId(String(carId)));
    }
    return Array.from(ids);
}

async function notifyDealerAndSellerOnExpectedPriceUpdate({ carId, newExpectedPrice }) {
    if (!carId || newExpectedPrice === undefined || newExpectedPrice === null) return;

    const car = await SelfInspectedCarsModel.findById(carId)
        .select('sellerContactNumber make model')
        .lean();

    if (!car) return;

    // seller external id (from phone)
    const sellerExternalId = await getUserIdByPhoneNumber(car.sellerContactNumber);

    // unique bidders
    const carIdMatchers = buildCarIdMatchers(carId);

    const offerMakerIds = await SelfInspectedCarOffersModel.distinct('userId', {
        carId: { $in: carIdMatchers },
    });

    const uniqueOfferMakerIds = Array.from(
        new Set((offerMakerIds || []).map(id => String(id)).filter(Boolean))
    ).filter(id => !sellerExternalId || id !== String(sellerExternalId));

    const carName = (!car.make || !car.model) ? 'car' : `${car.make} ${car.model}`.trim();

    // 1) Notify seller
    if (sellerExternalId) {
        await sendPushToExternalId({
            externalId: String(sellerExternalId),
            title: 'Self Inspected car CEP Revised',
            body: `Your expected & reserve price has been updated to ₹${newExpectedPrice.toLocaleString('en-IN')}/- for ${carName}.`,
            data: { carId: String(carId) },
        });
    }

    // 2) Notify bidders
    for (const externalId of uniqueOfferMakerIds) {
        await sendPushToExternalId({
            externalId: String(externalId),
            title: 'CEP Revised',
            body: `The deal price for ${carName} has been revised. Pls check and offer to win the car`,
            data: { carId: String(carId) },
        });
    }
}

module.exports = {
    notifyDealerAndSellerOnExpectedPriceUpdate,
};
