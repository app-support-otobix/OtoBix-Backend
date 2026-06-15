const mongoose = require("mongoose");

const parentModelIdsForServiceHistorySchema = new mongoose.Schema(
  {
    parentModel: {
      type: String,
      required: true,
      trim: true,
    },
    parentModelId: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true,
    versionKey: false }
);

module.exports = mongoose.model(
  "ParentModelIdsForServiceHistory",
  parentModelIdsForServiceHistorySchema,
  "parentModelIdsForServiceHistory"
);