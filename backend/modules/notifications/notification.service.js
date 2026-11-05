const mongoose = require("mongoose");
const Notification = require("./notification.model");
const User = require("../users/user.model");
const { sendEmail } = require("./email.service");
const { sendPush } = require("./push.service");

function httpError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

async function listForUser(userId, { unreadOnly = false, limit = 30 } = {}) {
  const filter = { recipient: userId };

  if (unreadOnly) filter.readAt = null;

  return Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(Number(limit) || 30, 1), 100))
    .lean();
}

async function createForUser({
  recipient,
  type,
  title,
  message,
  resourceId = null,
  resourceType = null,
}) {
  const notification = await Notification.create({
    recipient,
    type,
    title,
    message,
    resourceId,
    resourceType,
  });

  try {
    const { publishNotification } = require("../../src/realtime/eventPublisher");
    publishNotification(notification);
  } catch {
    // Non-fatal if publisher offline
  }

  return notification;
}

async function markRead(userId, notificationId) {
  if (!mongoose.isValidObjectId(notificationId)) {
    throw httpError(400, "Invalid notification ID.");
  }

  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { $set: { readAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!notification) {
    throw httpError(404, "Notification not found.");
  }

  return notification;
}

async function markAllRead(userId) {
  const result = await Notification.updateMany(
    { recipient: userId, readAt: null },
    { $set: { readAt: new Date() } }
  );

  return { modifiedCount: result.modifiedCount };
}

async function sendEmailToUser(userId, subject, text) {
  const user = await User.findById(userId).select("email isActive");

  if (!user || !user.isActive || !user.email) {
    throw httpError(404, "Active recipient with email not found.");
  }

  return sendEmail({ to: user.email, subject, text });
}

async function sendPushToToken(token, title, body, data) {
  return sendPush({ token, title, body, data });
}

module.exports = {
  listForUser,
  createForUser,
  markRead,
  markAllRead,
  sendEmailToUser,
  sendPushToToken,
};