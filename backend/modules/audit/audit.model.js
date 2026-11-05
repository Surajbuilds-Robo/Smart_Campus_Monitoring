const mongoose = require("mongoose");

const auditSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorRole: {
      type: String,
      default: null,
    },
    action: {
      type: String,
      required: true,
      index: true,
    },
    targetModel: {
      type: String,
      required: true,
      enum: ["User", "Camera", "Parking", "Occupancy", "Incident", "System"],
      index: true,
    },
    targetId: {
      type: String,
      default: null,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

auditSchema.index({ createdAt: -1 });

module.exports =
  mongoose.models.AuditLog || mongoose.model("AuditLog", auditSchema);
