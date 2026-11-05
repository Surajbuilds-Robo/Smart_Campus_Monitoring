const http = require("http");

const { env, validateEnv } = require("./config/env");
const { connectDB, disconnectDB } = require("./config/database");
const app = require("./app");
const {
  initializeSocketServer,
  closeSocketServer,
} = require("./realtime/socketServer");

const { seedInitialData } = require("./config/seedData");
const {
  startCameraMonitoring,
  stopCameraMonitoring,
} = require("../modules/cameras/cameraMonitor");

let httpServer;
let isShuttingDown = false;

async function startServer() {
  // 1. Validate environment configuration
  validateEnv();

  // 2. Ensure MongoDB connects BEFORE opening HTTP server to traffic
  await connectDB(env.MONGODB_URI);
  console.log("MongoDB connected successfully.");

  // Seed initial development data if needed
  if (process.env.NODE_ENV === "development") {
    await seedInitialData();
  }

  // 3. Create HTTP server with Express app
  httpServer = http.createServer(app);

  // 4. Attach Socket.IO on the same HTTP server instance
  initializeSocketServer(httpServer);

  // 5. Start listening for incoming requests
  await new Promise((resolve, reject) => {
    httpServer.once("error", reject);

    httpServer.listen(env.PORT, env.HOST, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  console.log(`Backend running at http://${env.HOST}:${env.PORT}`);
  console.log(`Health endpoint: http://localhost:${env.PORT}/api/v1/health`);

  // Start background IP camera monitoring and automatic reconnection
  startCameraMonitoring();

  return httpServer;
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} received. Shutting down gracefully...`);

  const forceExitTimer = setTimeout(() => {
    console.error("Graceful shutdown timed out.");
    process.exit(1);
  }, 10000);

  forceExitTimer.unref();

  try {
    stopCameraMonitoring();
    closeSocketServer();

    if (httpServer?.listening) {
      await new Promise((resolve) => {
        httpServer.close(() => resolve());
      });
    }

    await disconnectDB();

    console.log("Server stopped and MongoDB disconnected.");
    process.exitCode = 0;
  } catch (error) {
    console.error("Error during shutdown:", error);
    process.exitCode = 1;
  } finally {
    clearTimeout(forceExitTimer);
  }
}

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

// Run directly when invoked as main process
if (require.main === module) {
  startServer().catch(async (error) => {
    console.error("Failed to start backend:", error.message);

    try {
      await disconnectDB();
    } catch (disconnectError) {
      console.error("MongoDB disconnect failed:", disconnectError.message);
    }

    process.exit(1);
  });
}

module.exports = { startServer, shutdown };
