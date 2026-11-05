const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { retention } = require("../../../shared/constants.json");

const DEFAULT_RETENTION_DAYS = retention?.evidenceDays || 30;
const EVIDENCE_BASE_DIR = path.resolve(__dirname, "../../evidence_storage");

// Ensure evidence storage directory exists
if (!fs.existsSync(EVIDENCE_BASE_DIR)) {
  try {
    fs.mkdirSync(EVIDENCE_BASE_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to initialize evidence storage directory:", err.message);
  }
}

function createEvidenceRecord({
  storageKey,
  capturedAt = new Date(),
  retentionDays = DEFAULT_RETENTION_DAYS,
}) {
  if (!storageKey || typeof storageKey !== "string") {
    throw new Error("Valid storage key is required for evidence.");
  }

  const captureDate = new Date(capturedAt);
  if (isNaN(captureDate.getTime())) {
    throw new Error("Invalid capture timestamp for evidence.");
  }

  const expiresAt = new Date(
    captureDate.getTime() + retentionDays * 24 * 60 * 60 * 1000
  );

  return {
    storageKey: storageKey.trim(),
    capturedAt: captureDate,
    expiresAt,
  };
}

function isEvidenceExpired(evidenceItem) {
  if (!evidenceItem?.expiresAt) return true;
  return new Date(evidenceItem.expiresAt) <= new Date();
}

function filterActiveEvidence(evidenceList = []) {
  if (!Array.isArray(evidenceList)) return [];
  return evidenceList.filter((item) => !isEvidenceExpired(item));
}

/**
 * Save captured frame image from base64 string to persistent disk storage.
 * Enforces image type validation, file size limits (5MB), and safe naming.
 */
function saveEvidenceImage(base64Data, cameraId = "CAM") {
  if (!base64Data || typeof base64Data !== "string") {
    return null;
  }

  try {
    // Strip optional data URL prefix
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "").trim();
    const buffer = Buffer.from(cleanBase64, "base64");

    // 5MB limit
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      console.warn("Evidence image buffer empty or exceeded 5MB size limit.");
      return null;
    }

    // Verify JPEG or PNG magic bytes
    const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    const isPng =
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;

    if (!isJpeg && !isPng) {
      console.warn("Evidence image data failed magic byte validation (not JPEG or PNG).");
      return null;
    }

    const ext = isJpeg ? ".jpg" : ".png";
    const safeCamId = String(cameraId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const filename = `evidence_${safeCamId}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
    const filePath = path.join(EVIDENCE_BASE_DIR, filename);

    fs.writeFileSync(filePath, buffer);
    return filename;
  } catch (err) {
    console.error("Failed to save evidence image:", err.message);
    return null;
  }
}

/**
 * Resolve absolute path for storageKey while preventing directory traversal.
 */
function getEvidenceFilePath(storageKey) {
  if (!storageKey || typeof storageKey !== "string") {
    return null;
  }

  // Use only the basename to strictly prevent directory traversal attacks
  const safeFilename = path.basename(storageKey.trim());
  const absolutePath = path.resolve(EVIDENCE_BASE_DIR, safeFilename);

  // Verify the resolved path is strictly within the evidence base directory
  if (!absolutePath.startsWith(EVIDENCE_BASE_DIR)) {
    return null;
  }

  if (fs.existsSync(absolutePath)) {
    return absolutePath;
  }

  return null;
}

function sanitizeEvidenceForUser(user, evidenceList = [], incidentId = null) {
  if (!user || user.role === "STUDENT") {
    // Under no circumstances should students access raw incident evidence
    return [];
  }

  return filterActiveEvidence(evidenceList).map((item) => {
    const safeKey = path.basename(item.storageKey);
    const idStr = incidentId ? String(incidentId) : null;
    const url = idStr
      ? `/api/v1/incidents/${idStr}/evidence/${encodeURIComponent(safeKey)}`
      : item.url || null;

    return {
      storageKey: item.storageKey,
      capturedAt: item.capturedAt,
      expiresAt: item.expiresAt,
      url,
      thumbnailUrl: url,
    };
  });
}

module.exports = {
  createEvidenceRecord,
  isEvidenceExpired,
  filterActiveEvidence,
  sanitizeEvidenceForUser,
  saveEvidenceImage,
  getEvidenceFilePath,
  EVIDENCE_BASE_DIR,
};
