const mongoose = require("mongoose");

const parkingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    zoneId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    location: {
      type: String,
      required: true,
      trim: true,
    },
    building: {
      type: String,
      default: "",
      trim: true,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },
    totalSpaces: {
      type: Number,
      required: true,
      min: 1,
    },
    occupiedSpaces: {
      type: Number,
      default: 0,
      min: 0,
    },
    availableSpaces: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["available", "full", "unavailable"],
      default: "available",
      index: true,
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

parkingSchema.pre("validate", function () {
  if (this.occupiedSpaces > this.totalSpaces) {
    this.invalidate(
      "occupiedSpaces",
      "Occupied spaces cannot exceed total spaces."
    );
  }

  this.availableSpaces = Math.max(
    0,
    this.totalSpaces - this.occupiedSpaces
  );

  if (this.status !== "unavailable") {
    this.status =
      this.availableSpaces === 0 ? "full" : "available";
  }
});

module.exports =
  mongoose.models.Parking ||
  mongoose.model("Parking", parkingSchema);