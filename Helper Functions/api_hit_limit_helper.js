const ApiHitUsageCounter = require('../Models/apiHitUsageCounterModel');

const getTodayDateInKolkata = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  return `${map.year}-${map.month}-${map.day}`;
};

const checkAndConsumeApiHitLimit = async ({
  userId,
  apiName,
  limit,
  _retried = false,
}) => {
  try {
    const normalizedUserId = String(userId || '').trim();
    const normalizedApiName = String(apiName || '').trim();
    const numericLimit = Number(limit);

    if (!normalizedUserId || !normalizedApiName) {
      return false;
    }

    if (!Number.isFinite(numericLimit) || numericLimit <= 0) {
      return false;
    }

    const todayDate = getTodayDateInKolkata();

    let apiUsage = await ApiHitUsageCounter.findOne({
      userId: normalizedUserId,
      apiName: normalizedApiName,
    });

    // No doc exists => first hit for this user+api
    if (!apiUsage) {
      await ApiHitUsageCounter.create({
        userId: normalizedUserId,
        apiName: normalizedApiName,
        apiHitCount: 1,
        date: todayDate,
      });

      return true;
    }

    // New day => reset count and count current hit as first hit
    if (apiUsage.date !== todayDate) {
      apiUsage.date = todayDate;
      apiUsage.apiHitCount = 1;
      await apiUsage.save();

      return true;
    }

    // Same day => limit reached
    if (apiUsage.apiHitCount >= numericLimit) {
      return false;
    }

    // Same day => consume one hit
    apiUsage.apiHitCount += 1;
    await apiUsage.save();

    return true;
  } catch (error) {
    // In case two requests come exactly same time on first create
    if (error?.code === 11000 && !_retried) {
      return checkAndConsumeApiHitLimit({
        userId,
        apiName,
        limit,
        _retried: true,
      });
    }

    console.error('checkAndConsumeApiHitLimit error:', error.message);
    return false;
  }
};

module.exports = {
  checkAndConsumeApiHitLimit,
};