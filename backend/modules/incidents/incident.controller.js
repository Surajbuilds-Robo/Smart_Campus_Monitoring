const { validationResult } = require("express-validator");
const service = require("./incident.service");

function validate(req, res) {
  const errors = validationResult(req);

  if (errors.isEmpty()) return false;

  res.status(400).json({
    success: false,
    message: "Validation failed.",
    errors: errors.array(),
  });

  return true;
}

async function list(req, res, next) {
  try {
    if (validate(req, res)) return;

    const incidents = await service.listIncidents(req.user, req.query);

    return res.json({ success: true, data: { incidents } });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    if (validate(req, res)) return;

    const incident = await service.getIncident(req.user, req.params.id);

    return res.json({ success: true, data: { incident } });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    if (validate(req, res)) return;

    const incident = await service.createIncident(req.user, req.body);

    return res.status(201).json({
      success: true,
      data: { incident },
    });
  } catch (error) {
    next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    if (validate(req, res)) return;

    const incident = await service.updateStatus(
      req.user,
      req.params.id,
      req.body.status
    );

    return res.json({ success: true, data: { incident } });
  } catch (error) {
    next(error);
  }
}

async function assign(req, res, next) {
  try {
    if (validate(req, res)) return;

    const incident = await service.assignIncident(
      req.user,
      req.params.id,
      req.body.assignedTo
    );

    return res.json({ success: true, data: { incident } });
  } catch (error) {
    next(error);
  }
}

async function getEvidence(req, res, next) {
  try {
    if (validate(req, res)) return;

    const incident = await service.getIncident(req.user, req.params.id);
    const { storageKey } = req.params;

    const safeFilename = require("path").basename(storageKey);
    const hasEvidence = incident.evidence?.some(
      (e) => require("path").basename(e.storageKey) === safeFilename
    );

    if (!hasEvidence) {
      return res.status(404).json({
        success: false,
        message: "Evidence not found for this incident.",
      });
    }

    const { getEvidenceFilePath } = require("./evidence.service");
    const filePath = getEvidenceFilePath(storageKey);

    if (!filePath) {
      return res.status(404).json({
        success: false,
        message: "Physical evidence file not found or expired.",
      });
    }

    res.setHeader("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.setHeader("Content-Type", "image/jpeg");
    return res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
}

async function retryEmail(req, res, next) {
  try {
    if (validate(req, res)) return;

    const incident = await service.retryIncidentEmail(req.user, req.params.id);

    return res.json({
      success: true,
      message: "Email delivery retried.",
      data: {
        incident,
        incidentId: incident.incidentId,
        emailStatus: incident.emailStatus,
        emailSentAt: incident.emailSentAt,
        emailError: incident.emailError,
        emailRecipients: incident.emailRecipients,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  getById,
  create,
  updateStatus,
  assign,
  getEvidence,
  retryEmail,
};