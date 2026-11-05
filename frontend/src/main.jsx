import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { initThemeListener } from "./utils/theme";
import { registerServiceWorker } from "./utils/serviceWorkerRegistration";
import "./index.css";
import "./App.css";


initThemeListener();

registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);