const mongoose = require("mongoose");

let isListenersAttached = false;

function attachListeners() {
  if (isListenersAttached) return;
  isListenersAttached = true;

  mongoose.connection.on("connected", () => {
    console.log("MongoDB connection established.");
  });

  mongoose.connection.on("error", (err) => {
    console.error("MongoDB connection error:", err.message);
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected.");
  });
}

let memoryServerInstance = null;

async function connectDB(uri) {
  if (!uri) {
    throw new Error("Cannot connect to MongoDB: URI is required.");
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  attachListeners();

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
    });
    if (mongoose.connection.db) {
      await mongoose.connection.db.admin().ping();
    }
    return mongoose.connection;
  } catch (err) {
    if (mongoose.connection.readyState !== 0) {
      try {
        await mongoose.disconnect();
      } catch (_) {}
    }

    if (process.env.NODE_ENV === "development") {
      try {
        const { MongoMemoryServer } = require("mongodb-memory-server");
        console.warn(
          `Primary MongoDB at ${uri} unreachable (${err.message}). Starting embedded in-memory MongoDB for development...`
        );
        memoryServerInstance = await MongoMemoryServer.create({
          instance: { startupTimeout: 60000 },
        });
        const memoryUri = memoryServerInstance.getUri();
        await mongoose.connect(memoryUri, {
          serverSelectionTimeoutMS: 5000,
        });
        console.log("Embedded development MongoDB connected successfully.");
        return mongoose.connection;
      } catch (innerErr) {
        throw new Error(
          `Failed to connect to primary MongoDB (${err.message}) and embedded fallback failed (${innerErr.message})`
        );
      }
    }
    throw err;
  }
}

async function disconnectDB() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServerInstance) {
    await memoryServerInstance.stop();
    memoryServerInstance = null;
  }
}

function getDBStatus() {
  const readyState = mongoose.connection.readyState;
  const states = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };

  return {
    readyState,
    status: states[readyState] || "unknown",
    isConnected: readyState === 1,
  };
}

module.exports = {
  connectDB,
  disconnectDB,
  getDBStatus,
};
