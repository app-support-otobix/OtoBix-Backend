
const CarModel = require('../Models/carModel');
const { getAgenda } = require('../Agenda/agenda');
const { scheduleMoveCarFromUpcomingToLive } = require('../Agenda/Agenda Jobs/move_car_from_upcoming_to_live_job');
const CONSTANTS = require('../Utils/constants');
const { addWorkingMinutes, WORKING_HOURS } = require('../Helper Functions/set_working_hours_for_moving_car');


/** Normalize Mongo Extended JSON ( $date / $numberLong / $numberInt / $oid ) */
function normalize(v) {
  if (v === null || v === undefined) return v;
  if (Array.isArray(v)) return v.map(normalize);
  if (typeof v === 'object') {
    if ('$date' in v) {
      const d = v.$date;
      if (typeof d === 'string' || typeof d === 'number') return new Date(d);
      if (d && typeof d === 'object' && '$numberLong' in d) return new Date(Number(d.$numberLong));
    }
    if ('$numberLong' in v) return Number(v.$numberLong);
    if ('$numberInt' in v) return Number(v.$numberInt);
    if ('$oid' in v) return v.$oid;
    const out = {};
    for (const k of Object.keys(v)) out[k] = normalize(v[k]);
    return out;
  }
  return v;
}

/** Build object strictly in CarModel schema order (whitelist). */
function pickInSchemaOrder(model, src) {
  const ordered = {};
  const keys = Object.keys(model.schema.obj); // preserves declaration order
  for (const k of keys) if (src[k] !== undefined) ordered[k] = src[k];
  return ordered;
}

/**
 * POST /api/cars   (example route name)
 * Body: JSON (may include Extended JSON)
 * Behavior:
 *  - Upsert by appointmentId (fallback registrationNumber) — your original logic.
 *  - Compute upcomingUntil from upcomingTime (minutes) or FORCE_SECONDS in dev.
 *  - Set auctionStatus='upcoming' and schedule a unique Agenda job to flip to 'live'.
 */
exports.addADummyCar = async function (req, res) {
  try {
    const raw = normalize(req.body);

    // Derive auctionEndTime if needed (kept from your code)
    if (!raw.auctionEndTime && raw.auctionStartTime && raw.auctionDuration) {
      const startMs = new Date(raw.auctionStartTime).getTime();
      const durHrs = Number(raw.auctionDuration) || 24;
      raw.auctionEndTime = new Date(startMs + durHrs * 60 * 60 * 1000);
    }

    // ---- Compute when to flip to LIVE ----
    const now = new Date();

    // Try to use per-car upcomingTime if provided; default to 10 minutes.
    // If you're storing it as String, use parseInt(String(raw.upcomingTime || '10'), 10);
    const perCarMinutes = raw.upcomingTime !== undefined
      ? Number(raw.upcomingTime) // minutes
      : 10; // 10 minutes

    // DEV helper: if FORCE_SECONDS is set, prefer seconds (quick demo/test).
    // In production, leave FORCE_SECONDS undefined so minutes are used.
    const forceSeconds = process.env.FORCE_SECONDS ? Number(process.env.FORCE_SECONDS) : null;

    // const durationMs = forceSeconds != null
    //   ? forceSeconds * 1000
    //   : perCarMinutes * 60 * 1000;
    // const flipAt = new Date(now.getTime() + durationMs);
    const effectiveMinutes = forceSeconds != null ? (forceSeconds / 60) : perCarMinutes;
    // ✅ Align to working hours
    const flipAt = addWorkingMinutes(now, effectiveMinutes, WORKING_HOURS);

    // Ensure fields for upcoming flow
    raw.auctionStatus = CONSTANTS.AUCTION_STATUS.UPCOMING;
    raw.upcomingUntil = flipAt;

    // 🔽 Enforce your desired timings if not provided
    if (!raw.auctionStartTime) raw.auctionStartTime = flipAt;
    if (!raw.auctionDuration) raw.auctionDuration = 24;
    if (!raw.auctionEndTime) raw.auctionEndTime = new Date(new Date(raw.auctionStartTime).getTime() + 24 * 60 * 60 * 1000);

    // ---- Upsert filter (idempotency) ----
    const filter =
      raw.appointmentId ? { appointmentId: raw.appointmentId } :
        raw.registrationNumber ? { registrationNumber: raw.registrationNumber } :
          null;

    if (!filter) {
      return res.status(400).json({ message: 'appointmentId or registrationNumber required for upsert' });
    }

    // ---- Replace-or-Insert to keep key order ----
    const existing = await CarModel.findOne(filter).select('_id createdAt').lean();
    const dataOrdered = pickInSchemaOrder(CarModel, raw);
    const now2 = new Date();
    let carId;

    if (existing) {
      const createdAt = existing.createdAt || (existing._id?.getTimestamp?.() || now2);
      const replacement = { ...dataOrdered, createdAt, updatedAt: now2 };
      await CarModel.replaceOne({ _id: existing._id }, replacement, { upsert: true });
      carId = existing._id;
    } else {
      const created = await CarModel.create({ ...dataOrdered, createdAt: now2, updatedAt: now2 });
      carId = created._id;
    }

    // ---- Schedule the unique move-to-live job ----
    const agenda = getAgenda();

    // Safe to cancel any prior job if this was an upsert/overwrite
    await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.MOVE_CAR_FROM_UPCOMING_TO_LIVE, 'data.carId': carId.toString() });
    await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.START_LIVE_AUCTION, 'data.carId': carId.toString() });
    await agenda.cancel({ name: CONSTANTS.AGENDA_JOBS.END_LIVE_AUCTION, 'data.carId': carId.toString() });

    await scheduleMoveCarFromUpcomingToLive(agenda, carId, flipAt);



    // ---- Respond with saved doc + schedule info ----
    const saved = await CarModel.findById(carId);

    // SocketService.emitToRoom(EVENTS.UPCOMING_BIDS_SECTION_ROOM, EVENTS.UPCOMING_BIDS_SECTION_UPDATED, {
    //           action: 'added',
    //           id: saved._id.toString(),
    //           car: saved,
    //           message: 'Car added to upcoming bids section',
    //       });

    return res.status(existing ? 200 : 201).json({
      message: 'Car saved as UPCOMING and scheduled to move LIVE',
      car: saved,
      scheduledFor: flipAt,
      using: forceSeconds != null ? `FORCE_SECONDS=${forceSeconds}s` : `${perCarMinutes} minutes`,
    });

  } catch (err) {
    console.error('addADummyCar error:', err);
    return res.status(500).json({ message: 'Failed to save car', error: err?.message || String(err) });
  }
};

