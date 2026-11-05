const AuditLog = require("./audit.model");

async function recordAudit({
  actor = null,
  actorRole = null,
  action,
  targetModel,
  targetId = null,
  departmentId = null,
  details = {},
  ipAddress = null,
}) {
  try {
    return await AuditLog.create({
      actor: actor ? String(actor._id || actor.id || actor) : null,
      actorRole: actorRole || (actor && actor.role) || null,
      action,
      targetModel,
      targetId: targetId ? String(targetId._id || targetId.id || targetId) : null,
      departmentId: departmentId || (actor && actor.departmentId) || null,
      details,
      ipAddress,
    });
  } catch (error) {
    // Audit logging is non-blocking to prevent failures in business transactions
    console.error("Failed to record audit entry:", error.message);
    return null;
  }
}

async function listAuditLogs(user, filters = {}) {
  const query = {};

  if (user.role === "DEPT_HEAD" && user.departmentId) {
    query.departmentId = user.departmentId;
  } else if (user.role !== "SUPER_ADMIN") {
    const error = new Error("You do not have permission to view audit logs.");
    error.statusCode = 403;
    throw error;
  }

  if (filters.action) query.action = filters.action;
  if (filters.targetModel) query.targetModel = filters.targetModel;

  const limit = Math.min(Number(filters.limit) || 50, 100);

  return AuditLog.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("actor", "name email role")
    .lean();
}

module.exports = {
  recordAudit,
  listAuditLogs,
};
