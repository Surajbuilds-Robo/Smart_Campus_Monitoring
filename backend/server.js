const { startServer, shutdown } = require("./src/server");

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start backend:", error.message);
    process.exit(1);
  });
}

module.exports = { startServer, shutdown };
