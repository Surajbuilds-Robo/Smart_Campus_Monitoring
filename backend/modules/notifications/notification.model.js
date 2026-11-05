const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "incident_created",
        "incident_updated",
        "incident_assigned",
        "camera_status",
        "occupancy_warning",
        "system_alert",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    resourceType: {
      type: String,
      enum: ["Incident", "Camera", "Occupancy", null],
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
    emailStatus: {
      type: String,
      enum: ["not_requested", "pending", "sent", "failed"],
      default: "not_requested",
    },
    pushStatus: {
      type: String,
      enum: ["not_requested", "pending", "sent", "failed"],
      default: "not_requested",
    },
  },
  { timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });

module.exports =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);