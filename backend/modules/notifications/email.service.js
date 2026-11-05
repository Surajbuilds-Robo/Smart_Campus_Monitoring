const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

let transporter = null;

function ensureEnvLoaded() {
  if (!process.env.SMTP_HOST && !process.env.PORT) {
    try {
      const dotenv = require("dotenv");
      dotenv.config({ path: path.resolve(__dirname, "../../.env") });
    } catch {}
  }
}

function isEmailConfigured() {
  ensureEnvLoaded();
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return Boolean(SMTP_HOST?.trim() && SMTP_USER?.trim() && SMTP_PASS?.trim());
}

function getEmailFrom() {
  return (
    process.env.EMAIL_FROM ||
    process.env.SMTP_FROM ||
    process.env.SMTP_USER ||
    ""
  ).trim();
}

function getTransporter() {
  if (transporter) return transporter;

  ensureEnvLoaded();
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP environment variables are not configured.");
  }

  const port = Number(SMTP_PORT || 587);
  const secure = SMTP_SECURE === "true" || port === 465;

  transporter = nodemailer.createTransport({
    host: SMTP_HOST.trim(),
    port,
    secure,
    auth: {
      user: SMTP_USER.trim(),
      pass: SMTP_PASS.trim(),
    },
  });

  return transporter;
}

function resetTransporter() {
  transporter = null;
}

/**
 * Format a date object/ISO string into standard display representation for Asia/Kolkata
 */
function formatTimeInTimezone(date, timeZone = "Asia/Kolkata") {
  const dateObj = date instanceof Date ? date : new Date(date || Date.now());
  const validDate = isNaN(dateObj.getTime()) ? new Date() : dateObj;

  const dateOptions = {
    timeZone,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  };

  const timeOptions = {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };

  let localDate = "";
  let localTime = "";
  try {
    localDate = new Intl.DateTimeFormat("en-IN", dateOptions).format(validDate);
    localTime = new Intl.DateTimeFormat("en-IN", timeOptions).format(validDate);
  } catch {
    localDate = validDate.toDateString();
    localTime = validDate.toTimeString();
  }

  return {
    localDate,
    localTime,
    timeZone,
    fullDisplay: `${localDate}, ${localTime} (${timeZone})`,
    utcIso: validDate.toISOString(),
  };
}

/**
 * Generic email sender for custom transactional messages.
 */
async function sendEmail({ to, subject, text, html, attachments = [] }) {
  if (!to || !subject || (!text && !html)) {
    throw new Error("Recipient, subject, and message are required.");
  }

  const from = getEmailFrom();

  return getTransporter().sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments,
  });
}

/**
 * Send crowd alert notification email for threshold breaches.
 * Strict recipient deduplication, formatted timestamps in Asia/Kolkata,
 * UTC detection timestamp, and incident evidence frame attachment.
 */
async function sendCrowdAlertEmail({
  camera,
  incident,
  peopleCount,
  threshold,
  capturedAt,
  evidenceFilePath = null,
  recipients = [],
  appUrl = "http://localhost:5173",
}) {
  if (!isEmailConfigured()) {
    console.info(
      "[Email Notification] Email delivery skipped: SMTP environment variables are not configured."
    );
    return {
      success: false,
      status: "not_configured",
      error: "SMTP environment variables are not configured.",
      recipients: [],
    };
  }

  if (!Array.isArray(recipients) || recipients.length === 0) {
    console.warn("[Email Notification] No eligible recipients provided for incident email.");
    return {
      success: false,
      status: "failed",
      error: "No eligible recipients found.",
      recipients: [],
    };
  }

  // Deduplicate and validate recipient email addresses
  const validRecipients = Array.from(
    new Set(
      recipients
        .map((r) => (typeof r === "string" ? r.trim().toLowerCase() : ""))
        .filter((r) => r.includes("@") && r.length >= 5)
    )
  );

  if (validRecipients.length === 0) {
    return {
      success: false,
      status: "failed",
      error: "No valid email addresses in recipient list.",
      recipients: [],
    };
  }

  const cameraId = camera.cameraId || camera.id || "CAM-01";
  const cameraName = camera.name || cameraId;
  const location = camera.location || "Campus Ground";
  const building = camera.building ? ` / ${camera.building}` : "";
  const fullLocation = `${location}${building}`;
  const incidentId = incident.incidentId || incident._id || "INC-UNKNOWN";
  const incidentMongoId = incident._id ? String(incident._id) : incidentId;

  const detectionTimeInfo = formatTimeInTimezone(capturedAt || incident.createdAt, "Asia/Kolkata");
  const emailSentTimeInfo = formatTimeInTimezone(new Date(), "Asia/Kolkata");

  const secureLink = `${appUrl.replace(/\/$/, "")}/incidents?id=${incidentMongoId}`;

  const subject = `[Campus Alert] People Count Threshold Exceeded — ${cameraId}`;

  const plainTextBody = `
============================================================
CAMPUS SAFETY ALERT — PEOPLE COUNT THRESHOLD EXCEEDED
============================================================

An automated safety threshold breach was detected by the Smart Campus AI Vision system.

INCIDENT DETAILS:
------------------------------------------------------------
* Incident Title: People Count Threshold Exceeded
* Camera Name:    ${cameraName}
* Camera ID:      ${cameraId}
* Location:       ${fullLocation}
* Detected Count: ${peopleCount} people
* Threshold:      ${threshold} people
* Trigger Rule:   person_count > threshold (5 or more people detected)

TIMESTAMPS:
------------------------------------------------------------
* Incident Date:        ${detectionTimeInfo.localDate}
* Local Incident Time:  ${detectionTimeInfo.localTime}
* Timezone:             ${detectionTimeInfo.timeZone}
* Detection Timestamp:  ${detectionTimeInfo.utcIso}
* Email Delivery Time:  ${emailSentTimeInfo.utcIso} (${emailSentTimeInfo.timeZone})

INCIDENT IDENTIFIER:
------------------------------------------------------------
* Incident ID: ${incidentId}

ACTIONS & EVIDENCE:
------------------------------------------------------------
Review full telemetry, live camera feed, and authorized resolution workflow at:
${secureLink}

The actual captured incident frame is attached to this email.

Smart Campus Automated Safety Monitoring System
Do not reply to this automated alert.
============================================================
`.trim();

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; margin: 0; padding: 20px; }
    .card { max-width: 620px; margin: 0 auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
    .header { background: #dc2626; color: #ffffff; padding: 20px; text-align: left; }
    .header h1 { margin: 0 0 6px 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 0; font-size: 13px; opacity: 0.9; }
    .content { padding: 24px; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 11px; font-weight: 700; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; background: #fee2e2; color: #991b1b; }
    .metric-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0; }
    .metric-box { background: #f1f5f9; border-radius: 8px; padding: 12px; border-left: 3px solid #dc2626; }
    .metric-box .label { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
    .metric-box .value { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .detail-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
    .detail-table td { padding: 8px 0; border-bottom: 1px solid #f1f5f9; }
    .detail-table td.label { color: #64748b; font-weight: 600; width: 38%; }
    .detail-table td.value { color: #0f172a; font-weight: 500; font-family: monospace; }
    .cta { text-align: center; margin: 24px 0 16px; }
    .btn { display: inline-block; background: #dc2626; color: #ffffff !important; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; }
    .footer { background: #f8fafc; padding: 16px 24px; text-align: center; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <span class="badge" style="background:#ffffff; color:#dc2626; margin-bottom:8px;">Campus Alert</span>
      <h1>People Count Threshold Exceeded</h1>
      <p>Automated edge AI incident detected at ${cameraName} (${cameraId})</p>
    </div>
    <div class="content">
      <div class="metric-grid">
        <div class="metric-box">
          <div class="label">Detected Count</div>
          <div class="value" style="color:#dc2626;">${peopleCount} People</div>
        </div>
        <div class="metric-box">
          <div class="label">Configured Threshold</div>
          <div class="value">${threshold} People</div>
        </div>
      </div>

      <table class="detail-table">
        <tr>
          <td class="label">Incident ID</td>
          <td class="value">${incidentId}</td>
        </tr>
        <tr>
          <td class="label">Camera Node</td>
          <td class="value">${cameraName} (${cameraId})</td>
        </tr>
        <tr>
          <td class="label">Location</td>
          <td class="value">${fullLocation}</td>
        </tr>
        <tr>
          <td class="label">Incident Date</td>
          <td class="value">${detectionTimeInfo.localDate}</td>
        </tr>
        <tr>
          <td class="label">Local Incident Time</td>
          <td class="value">${detectionTimeInfo.localTime} (${detectionTimeInfo.timeZone})</td>
        </tr>
        <tr>
          <td class="label">Detection Timestamp (UTC)</td>
          <td class="value">${detectionTimeInfo.utcIso}</td>
        </tr>
        <tr>
          <td class="label">Email Delivery Time</td>
          <td class="value">${emailSentTimeInfo.utcIso}</td>
        </tr>
      </table>

      <div class="cta">
        <a href="${secureLink}" class="btn">View Incident Details in Dashboard</a>
      </div>
      <p style="font-size:12px; color:#64748b; text-align:center;">
        The verified incident frame that caused the alert is attached to this email.
      </p>
    </div>
    <div class="footer">
      Smart Campus Operations & Safety Monitoring Platform &bull; Automated Security Dispatch
    </div>
  </div>
</body>
</html>
`.trim();

  const attachments = [];
  if (evidenceFilePath && fs.existsSync(evidenceFilePath)) {
    try {
      attachments.push({
        filename: `incident-${cameraId}-${incidentId}.jpg`,
        path: evidenceFilePath,
        cid: "incidentEvidenceImage",
      });
    } catch (attErr) {
      console.warn("Could not attach evidence image file:", attErr.message);
    }
  }

  const from = getEmailFrom();

  try {
    const info = await getTransporter().sendMail({
      from,
      to: validRecipients,
      subject,
      text: plainTextBody,
      html: htmlBody,
      attachments,
    });

    console.info(
      `[Email Notification] Alert sent successfully for incident ${incidentId} to ${validRecipients.length} recipients. MessageId: ${info.messageId}`
    );

    return {
      success: true,
      status: "sent",
      messageId: info.messageId,
      sentAt: new Date(),
      recipients: validRecipients,
    };
  } catch (err) {
    // Log failure without leaking credentials or SMTP password
    console.error(
      `[Email Notification] Delivery failed for incident ${incidentId}: ${err.message}`
    );

    return {
      success: false,
      status: "failed",
      error: err.message,
      recipients: validRecipients,
    };
  }
}

module.exports = {
  isEmailConfigured,
  getTransporter,
  resetTransporter,
  formatTimeInTimezone,
  sendEmail,
  sendCrowdAlertEmail,
};