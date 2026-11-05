const mongoose = require("mongoose");

const cameraSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    cameraId: {
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
    },
    status: {
      type: String,
      enum: ["online", "offline", "maintenance"],
      default: "offline",
      index: true,
    },
    lastHeartbeat: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    streamUrl: {
      type: String,
      default: "",
      trim: true,
    },
    previewUrl: {
      type: String,
      default: "",
      trim: true,
    },
    streamType: {
      type: String,
      enum: ["hls", "webrtc", "mjpeg", "rtsp", "mp4", "auto"],
      default: "auto",
    },
    streamQualities: {
      type: [String],
      default: ["720p"],
    },
    dvrSupported: {
      type: Boolean,
      default: false,
    },
    cameraType: {
      type: String,
      enum: ["ip_camera", "cctv_rtsp", "fixed_dome", "ptz"],
      default: "ip_camera",
    },
    autoReconnect: {
      type: Boolean,
      default: true,
    },
    lastSeenAt: {
      type: Date,
      default: null,
    },
    consecutiveFailures: {
      type: Number,
      default: 0,
    },
    discoveryPort: {
      type: Number,
      default: 8080,
    },
    lastDetectionAt: {
      type: Date,
      default: null,
    },
    aiDetectionActive: {
      type: Boolean,
      default: false,
    },
    crowdAlertActive: {
      type: Boolean,
      default: false,
      index: true,
    },
    crowdAlertThreshold: {
      type: Number,
      default: 4,
    },
  },
  { timestamps: true }
);


module.exports =
  mongoose.models.Camera || mongoose.model("Camera", cameraSchema);