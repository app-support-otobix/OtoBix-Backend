// Plugins/notify_cep_achieved_car_model_plugin.js
'use strict';

const { sendPushToExternalId } = require('../Helper Functions/send_notification_helpers');
const { getCustomerIdByPhoneNumber } = require('../Helper Functions/external_id_extraction_helpers');
const CONSTANTS = require('../Utils/constants');
const {
  calculateCustomerNetAmountAfterMarginAdjustment,
  roundDownToPrevious1000,
} = require('../Helper Functions/margin_set_amount_helpers');



module.exports = function notifyCepAchievedPlugin(schema) {
  schema.pre('findOneAndUpdate', async function () {
    try {
      this._prev = await this.model
        .findOne(this.getQuery(), {
          highestBid: 1,
          otobuyOffer: 1, 
          customerExpectedPrice: 1,
          contactNumber: 1,
          make: 1,
          model: 1,
          auctionStatus: 1,
          fixedMargin: 1,
          variableMargin: 1,
        })
        .lean();
    } catch (e) {
      this._prev = null;
    }
  });

  schema.post('findOneAndUpdate', async function (doc) {
    try {
      const prev = this._prev;
      if (!prev) return;

      const after =
        doc ||
        (await this.model
          .findOne(this.getQuery(), {
            highestBid: 1,
            otobuyOffer: 1,
            customerExpectedPrice: 1,
            contactNumber: 1,
            make: 1,
            model: 1,
            auctionStatus: 1,
            fixedMargin: 1,
            variableMargin: 1,
          })
          .lean());

      if (!after) return;

      // ✅ Only if car is in UPCOMING or LIVE or OTOBUY (if you have it)
      const allowedStatuses = [
        CONSTANTS.AUCTION_STATUS.UPCOMING,
        CONSTANTS.AUCTION_STATUS.LIVE,
        CONSTANTS.AUCTION_STATUS.OTOBUY, 
      ].filter(Boolean);

      if (!allowedStatuses.includes(after.auctionStatus)) return;

      const cep = Number(after.customerExpectedPrice || 0);
      if (cep <= 0) return;

      const fixedPercent = Number(after.fixedMargin || 0);
      const variablePercent = Number(after.variableMargin || 0);

      const toRoundedNet = (gross) => {
        const net = calculateCustomerNetAmountAfterMarginAdjustment({
          grossAmount: Number(gross || 0),
          fixedPercent,
          variablePercent,
        });
        return roundDownToPrevious1000(net);
      };

      // 1) Highest bid crosses CEP
      const prevHighest = toRoundedNet(prev.highestBid);
      const newHighest = toRoundedNet(after.highestBid);
      const highestBidCrossed = prevHighest < cep && newHighest >= cep;

      // 2) Otobuy offer crosses CEP (only when car is in otobuy mode)
      const isOtobuyMode = after.auctionStatus === CONSTANTS.AUCTION_STATUS.OTOBUY;
      const prevOtobuy = toRoundedNet(prev.otobuyOffer);
      const newOtobuy = toRoundedNet(after.otobuyOffer);
      const otobuyCrossed = isOtobuyMode && prevOtobuy < cep && newOtobuy >= cep;

      if (!highestBidCrossed && !otobuyCrossed) return;

      const customerId = await getCustomerIdByPhoneNumber(after.contactNumber);
      if (!customerId) return;

      console.log('Notification sent to customer', customerId);

      await sendPushToExternalId({
        externalId: customerId,
        title: '🎉 Expected Price Achieved',
        body: `Congratulations! Your ask has been achieved. We will get in touch with you with the next steps. Happy Selling!`,
        data: { carId: after._id.toString() },
      });
    } catch (e) {
      console.error('[CEP_ACHIEVED_PLUGIN] error:', e);
    }
  });
};
