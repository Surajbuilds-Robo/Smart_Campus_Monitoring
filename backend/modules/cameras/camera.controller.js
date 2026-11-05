const { validationResult } = require("express-validator");
const cameraService = require("./camera.service");

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

    const cameras = await cameraService.listCameras(req.user, req.query);

    return res.json({
      success: true,
      data: { cameras },
    });
  } catch (error) {
    next(error);
  }
}

async function getById(req, res, next) {
  try {
    if (validate(req, res)) return;

    const camera = await cameraService.getCamera(req.user, req.params.id);

    return res.json({
      success: true,
      data: { camera },
    });
  } catch (error) {
    next(error);
  }
}

async function create(req, res, next) {
  try {
    if (validate(req, res)) return;

    const camera = await cameraService.createCamera(req.user, req.body);

    return res.status(201).json({
      success: true,
      data: { camera },
    });
  } catch (error) {
    next(error);
  }
}

async function update(req, res, next) {
  try {
    if (validate(req, res)) return;

    const camera = await cameraService.updateCamera(
      req.user,
      req.params.id,
      req.body
    );

    return res.json({
      success: true,
      data: { camera },
    });
  } catch (error) {
    next(error);
  }
}

async function remove(req, res, next) {
  try {
    if (validate(req, res)) return;

    const result = await cameraService.deleteCamera(req.user, req.params.id);

    return res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}

async function getStream(req, res, next) {
  try {
    if (validate(req, res)) return;

    const stream = await cameraService.getStreamInfo(req.user, req.params.id);

    return res.json({
      success: true,
      data: { stream },
    });
  } catch (error) {
    next(error);
  }
}

async function getStreamTicket(req, res, next) {
  try {
    if (validate(req, res)) return;

    const data = await cameraService.generateStreamTicket(req.user, req.params.id);

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
}

async function getAnalytics(req, res, next) {
  try {
    if (validate(req, res)) return;

    const analytics = await cameraService.getCameraAnalytics(
      req.user,
      req.params.id,
      req.query
    );

    return res.json({
      success: true,
      data: { analytics },
    });
  } catch (error) {
    next(error);
  }
}

async function verify(req, res, next) {
  try {
    if (validate(req, res)) return;

    const result = await cameraService.verifyCameraStream(req.user, req.params.id, req.body);

    if (result && result.rateLimited) {
      const retryAfter = result.retryAfter || 5;
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        success: false,
        rateLimited: true,
        retryAfter,
        message: result.message || `Stream verification rate-limited. Please wait ${retryAfter}s before probing again.`,
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function verifyRaw(req, res, next) {
  try {
    if (validate(req, res)) return;

    const result = await cameraService.verifyRawStream(req.user, req.body.streamUrl);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function streamProxy(req, res, next) {
  try {
    if (validate(req, res)) return;

    await cameraService.proxyMjpegStream(req.user, req.params.id, req, res);
  } catch (error) {
    next(error);
  }
}

async function annotatedStreamProxy(req, res, next) {
  try {
    if (validate(req, res)) return;

    await cameraService.proxyAnnotatedStream(req.user, req.params.id, req, res);
  } catch (error) {
    next(error);
  }
}

async function reconnect(req, res, next) {
  try {
    if (validate(req, res)) return;

    const result = await cameraService.reconnectCamera(req.user, req.params.id);

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function discover(req, res, next) {
  try {
    if (validate(req, res)) return;

    const result = await cameraService.discoverPhoneCamera(
      req.user,
      req.params.id,
      req.body
    );

    if (result && result.rateLimited) {
      const retryAfter = result.retryAfter || 15;
      res.setHeader("Retry-After", String(retryAfter));
      return res.status(429).json({
        success: false,
        rateLimited: true,
        retryAfter,
        message: result.message || `Discovery scan rate-limited. Please wait ${retryAfter}s before scanning again.`,
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

async function announce(req, res, next) {
  try {
    if (validate(req, res)) return;

    const clientIp =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      req.ip;

    const result = await cameraService.announcePhoneCamera(
      req.user,
      req.params.id,
      clientIp,
      req.body
    );

    return res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  getStream,
  getStreamTicket,
  getAnalytics,
  verify,
  verifyRaw,
  streamProxy,
  annotatedStreamProxy,
  reconnect,
  discover,
  announce,
};