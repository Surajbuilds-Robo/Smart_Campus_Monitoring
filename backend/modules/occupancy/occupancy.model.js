const mongoose = require("mongoose");

const occupancySchema = new mongoose.Schema(
  {
    camera: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Camera",
      required: true,
      index: true,
    },
    cameraId: {
      type: String,
      required: true,
      index: true,
    },
    zoneName: {
      type: String,
      required: true,
      trim: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },
    peopleCount: {
      type: Number,
      required: true,
      min: 0,
    },
    capacity: {
      type: Number,
      required: true,
      min: 1,
    },
    occupancyRatio: {
      type: Number,
      required: true,
      min: 0,
    },
    level: {
      type: String,
      enum: ["normal", "warning", "critical"],
      required: true,
    },
    observedAt: {
      type: Date,
      required: true,
      index: true,
    },
    confidence: {
      type: Number,
      default: null,
    },
    detections: [
      {
        label: { type: String, default: "person" },
        confidence: { type: Number, default: 0 },
        bbox: [{ type: Number }],
      },
    ],
  },
  { timestamps: true }
);

occupancySchema.index({ camera: 1, observedAt: -1 });
occupancySchema.index({ cameraId: 1, observedAt: -1 });

module.exports =
  mongoose.models.Occupancy ||
  mongoose.model("Occupancy", occupancySchema);