const UserModel = require('../Models/userModel');
const SocketService = require('../Config/socket_service');
const EVENTS = require('../Sockets/socket_events');

/**
 * Full logic (same as your addToPurchasedCars API):
 * - validate
 * - $addToSet purchasedCars
 * - fetch latest purchasedCars
 * - emit socket only if actually added
 *
 * Throws on error (useful for your add API).
 */
async function addPurchasedCarFull({ userId, carId } = {}) {
    if (!userId || !carId) {
        const err = new Error('userId and carId are required');
        err.status = 400;
        throw err;
    }

    const normalizedCarId = String(carId).trim();

    const result = await UserModel.updateOne(
        { _id: userId },
        { $addToSet: { purchasedCars: normalizedCarId } }
    );

    if (result.matchedCount === 0) {
        const err = new Error('User not found');
        err.status = 404;
        throw err;
    }

    const added = result.modifiedCount === 1;

    const user = await UserModel.findById(userId).select('purchasedCars').lean();
    const purchasedCars = user?.purchasedCars || [];

    // 🔔 realtime push (only if DB actually changed)
    if (added) {
        SocketService.emitToRoom(
            `${EVENTS.USER_ROOM}${userId}`,
            EVENTS.PURCHASED_CARS_UPDATED,
            { action: 'add', carId: normalizedCarId }
        );
    }

    return {
        success: true,
        added,
        purchasedCars,
        carId: normalizedCarId,
    };
}

/**
 * Safe wrapper:
 * - NEVER throws
 * - logs error
 * - returns consistent response
 *
 * Use this in markCarAsSold.
 */
async function safeAddPurchasedCar({ userId, carId } = {}) {
    try {
        const data = await addPurchasedCarFull({ userId, carId });
        return { ok: true, ...data };
    } catch (err) {
        console.error('safeAddPurchasedCar failed:', {
            userId,
            carId,
            message: err?.message,
            status: err?.status,
        });

        return {
            ok: false,
            error: err?.message || 'Failed to add purchased car',
            status: err?.status || 500,
        };
    }
}

module.exports = { addPurchasedCarFull, safeAddPurchasedCar };
