/**
 * Service Worker registration utility for Progressive Web App.
 */

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  // In development mode, ensure any existing service worker is unregistered
  // to avoid caching stale HMR tokens and interfering with Vite WebSockets.
  if (import.meta.env?.DEV) {
    unregisterServiceWorker();
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker == null) return;

          installingWorker.onstatechange = () => {
            if (installingWorker.state === "installed") {
              if (navigator.serviceWorker.controller) {
                // New update available
                window.dispatchEvent(new CustomEvent("pwa-update-available"));
              }
            }
          };
        };
      })
      .catch(() => {
        // Service worker registration ignored in unsupported contexts
      });
  });
}

export function unregisterServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch(() => {});
  }
}
