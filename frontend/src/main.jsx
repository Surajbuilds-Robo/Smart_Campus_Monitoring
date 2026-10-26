import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { initThemeListener } from "./utils/theme";
import { registerServiceWorker } from "./utils/serviceWorkerRegistration";
import "./index.css";
import "./App.css";

// Sync with OS color scheme immediately and listen for live OS theme changes
initThemeListener();

// Register PWA Service Worker for offline app shell capability
registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);