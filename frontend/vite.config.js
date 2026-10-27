import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    hmr: {
      clientPort: 5173,
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (err, req, res) => {
            if (res && !res.headersSent && typeof res.writeHead === "function") {
              res.writeHead(502, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Backend server offline or restarting" }));
            }
          });
        },
      },
      "/socket.io": {
        target: "http://127.0.0.1:5000",
        ws: true,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (err, _req, socket) => {
            if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED") {
              if (socket && !socket.destroyed && typeof socket.destroy === "function") {
                socket.destroy();
              }
              return;
            }
          });
          proxy.on("proxyReqWsError", (err, _req, socket) => {
            if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED") {
              if (socket && !socket.destroyed && typeof socket.destroy === "function") {
                socket.destroy();
              }
              return;
            }
          });
          proxy.on("open", (proxySocket) => {
            proxySocket.on("error", (err) => {
              if (err.code === "ECONNRESET" || err.code === "ECONNREFUSED") return;
            });
          });
        },
      },
    },
  },
});