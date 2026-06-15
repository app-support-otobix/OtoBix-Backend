const mongoose = require('mongoose');

const apiHitUsageCounterSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    apiName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    apiHitCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    date: {
      type: String, // e.g. "2026-03-09"
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// One user + one api = one document
apiHitUsageCounterSchema.index(
  { userId: 1, apiName: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  'ApiHitUsageCounter',
  apiHitUsageCounterSchema,
  'apiHitUsageCounter'
);