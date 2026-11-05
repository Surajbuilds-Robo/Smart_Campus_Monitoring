const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
  {
    incidentId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: [
        "crowd_overcrowding",
        "parking_violation",
        "fall",
        "violence",
        "other",
      ],
      index: true,
    },
    severity: {
      type: String,
      enum: ["info", "warning", "high", "critical"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: [
        "new",
        "acknowledged",
        "investigating",
        "resolved",
        "dismissed",
      ],
      default: "new",
      index: true,
    },
    camera: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Camera",
      required: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    acknowledgedAt: Date,
    resolvedAt: Date,
    dismissedAt: Date,
    capturedAt: {
      type: Date,
      default: Date.now,
    },
    evidence: [
      {
        storageKey: { type: String, required: true },
        capturedAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true },
      },
    ],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    emailStatus: {
      type: String,
      enum: ["not_requested", "not_configured", "pending", "sent", "failed"],
      default: "not_requested",
      index: true,
    },
    emailSentAt: {
      type: Date,
      default: null,
    },
    emailError: {
      type: String,
      default: null,
    },
    emailRecipients: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Incident ||
  mongoose.model("Incident", incidentSchema);