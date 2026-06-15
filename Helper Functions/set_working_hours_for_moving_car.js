// /Helper Functions/set_working_hours_for_moving_car.js

// Configurable working hours (local server time unless you handle TZ separately)
const WORKING_HOURS = {
    start: { hour: 11, minute: 0 }, // 11:00 means 11am
    end: { hour: 18, minute: 0 }, // 18:00 means 6pm
};

function nextWindowStart(d, hours = WORKING_HOURS) {
    const n = new Date(d);
    n.setHours(hours.start.hour, hours.start.minute || 0, 0, 0);
    if (d <= n) return n;
    n.setDate(n.getDate() + 1);
    return n;
}

/**
 * Add "minutes" counting only time inside working hours.
 * If "from" is outside the window, it jumps to the next window start and continues.
 */
function addWorkingMinutes(from, minutes, hours = WORKING_HOURS) {
    let d = new Date(from);
    let remainingMs = Math.max(0, minutes) * 60 * 1000;

    for (let i = 0; i < 366; i++) {
        const start = new Date(d);
        start.setHours(hours.start.hour, hours.start.minute || 0, 0, 0);

        const end = new Date(d);
        end.setHours(hours.end.hour, hours.end.minute || 0, 0, 0);

        // Before working hours → jump to start
        if (d < start) {
            d = start;
        }

        // After working hours → jump to next day’s start
        if (d >= end) {
            d = nextWindowStart(d, hours);
            continue;
        }

        // Inside working hours
        const availableToday = end.getTime() - d.getTime();
        if (remainingMs <= availableToday) {
            return new Date(d.getTime() + remainingMs);
        }

        // Consume today, carry to next window
        remainingMs -= availableToday;
        d = nextWindowStart(d, hours);
    }

    // Fallback (shouldn’t happen)
    return nextWindowStart(from, hours);
}

module.exports = {
    WORKING_HOURS,
    addWorkingMinutes,
};
