const { Server } = require("socket.io");
const socketAuth = require("./socketAuth");
const { joinAuthorizedRooms, isRoomAuthorized } = require("./socketRooms");
const { initializePublisher } = require("./eventPublisher");
const { socketEvents } = require("../../../shared/constants.json");

let ioInstance = null;

function initializeSocketServer(httpServer) {
  if (ioInstance) {
    return ioInstance;
  }

  const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  function isAllowedOrigin(origin) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
      return true;
    }

    if (process.env.NODE_ENV === "development") {
      try {
        const parsed = new URL(origin);
        if (
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          /^10\.\d+\.\d+\.\d+$/.test(parsed.hostname) ||
          /^192\.168\.\d+\.\d+$/.test(parsed.hostname) ||
          /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(parsed.hostname)
        ) {
          return true;
        }
      } catch {
        return false;
      }
    }

    return false;
  }

  const io = new Server(httpServer, {
    cors: {
      origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
          return callback(null, true);
        }
        return callback(new Error("Origin not allowed by CORS."));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
    transports: ["websocket", "polling"],
  });

  io.use(socketAuth);

  io.on("connection", async (socket) => {
    try {
      const joinedRooms = await joinAuthorizedRooms(socket);

      socket.emit(socketEvents.connectionReady || "connection:ready", {
        connected: true,
        userId: socket.user.id,
        role: socket.user.role,
        departmentId: socket.user.departmentId,
        rooms: joinedRooms,
      });

      // Prevent unauthorized room subscription attempts from clients
      socket.on("room:join", (requestedRoom) => {
        if (!isRoomAuthorized(socket.user, requestedRoom)) {
          socket.emit("room:error", {
            message: `Unauthorized attempt to join room: ${requestedRoom}`,
          });
          return;
        }

        socket.join(requestedRoom);
      });
    } catch (error) {
      console.error("Socket room initialization failed:", error.message);
      socket.disconnect(true);
      return;
    }

    socket.on("disconnect", (reason) => {
      // Disconnection handled safely
    });
  });

  initializePublisher(io);
  ioInstance = io;

  return io;
}

function getSocketServer() {
  return ioInstance;
}

function closeSocketServer() {
  if (ioInstance) {
    ioInstance.disconnectSockets(true);
    ioInstance.close();
    ioInstance = null;
    initializePublisher(null);
  }
}

module.exports = {
  initializeSocketServer,
  getSocketServer,
  closeSocketServer,
};