// Helper Functions/margin_set_amount_helpers.js

// Rounding helpers (keep outside so other functions can reuse)
function roundDownToPrevious1000(value) {
    const n = Number(value) || 0;
    return Math.floor(n / 1000) * 1000;
}
function roundUpToNext1000(value) {
    const n = Number(value) || 0;
    return Math.ceil(n / 1000) * 1000;
}

/**
 * Margin math helpers (reusable)
 * Converts a gross amount (dealer price) to net amount (customer price)
 * using inverse markup: net = gross / (1 + (fixed+variable)/100)
 */
function calculateCustomerNetAmountAfterMarginAdjustment({ grossAmount, fixedPercent, variablePercent }) {
    const gross = Number(grossAmount) || 0;
    const fixed = Number(fixedPercent) || 0;
    const variable = Number(variablePercent) || 0;

    const totalPercent = fixed + variable;
    const factor = 1 + (totalPercent / 100);

    if (!Number.isFinite(factor) || factor <= 0) return 0;

    const net = gross / factor;
    return Number.isFinite(net) ? net : 0;
}

// Returns customer's highest bid after removing margins.
 function getCustomerHighestBidAfterMarginAdjustment(car) {
    // const car = await CarModel.findById(carId)
    //     .select('highestBid fixedMargin variableMargin')
    //     .lean();

    if (!car) return null;

    const net = calculateCustomerNetAmountAfterMarginAdjustment({
        grossAmount: car.highestBid,
        fixedPercent: car.fixedMargin,
        variablePercent: car.variableMargin,
    });

    return roundDownToPrevious1000(net);
}




// Increase Margin
function getIncreasedMarginAmount({ amount, fixedMargin, variableMargin }) {
    const originalAmount = Number(amount) || 0;
    const fixed = Number(fixedMargin) || 0;
    const variable = Number(variableMargin) || 0;
    
    const totalMargin = fixed + variable;
    const totalMarginInDecimal = totalMargin / 100;
    const marginAmount = originalAmount * totalMarginInDecimal;
    const finalAmount = originalAmount + marginAmount;

    return roundUpToNext1000(finalAmount);
}

// Decrease Margin
function getDecreasedMarginAmount({ amount, fixedMargin, variableMargin }) {
    const originalAmount = Number(amount) || 0;
    const fixed = Number(fixedMargin) || 0;
    const variable = Number(variableMargin) || 0;
    
    const totalMargin = fixed + variable;
    const totalMarginInDecimal = totalMargin / 100;
    const reverseMargin = totalMarginInDecimal / (1 + totalMarginInDecimal);
    const finalAmount = originalAmount * (1 - reverseMargin);
    
    return roundDownToPrevious1000(finalAmount);
}



module.exports = {
    // main functions
    getCustomerHighestBidAfterMarginAdjustment,
    calculateCustomerNetAmountAfterMarginAdjustment,

    // export helpers too (useful if other files need them)
    roundDownToPrevious1000,
    roundUpToNext1000,
    
    
    // new exports
    getIncreasedMarginAmount,
    getDecreasedMarginAmount,
};
