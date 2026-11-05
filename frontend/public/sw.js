/**
 * Smart Campus Monitoring - Progressive Web App Service Worker
 *
 * PRIVACY & SECURITY POLICY:
 * 1. STRICTLY BYPASSES and NEVER CACHES:
 *    - All backend API responses (/api/*)
 *    - Realtime WebSocket and Socket.IO handshakes (/socket.io/*)
 *    - Authentication endpoints and authorization tokens
 *    - Live camera streams and RTSP edge metadata
 *    - Private incident evidence screenshots and burst frames
 * 2. Caches ONLY the public immutable frontend app shell (HTML, CSS, JS bundles, icons).
 */

const CACHE_NAME = "smart-campus-shell-v1";

const APP_SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/icon.svg",
];

// Check if request is sensitive and must bypass caching entirely
function isSensitiveRequest(url, request) {
  const pathname = url.pathname.toLowerCase();

  // 1. Never cache any backend API endpoints
  if (pathname.startsWith("/api/")) return true;

  // 2. Never cache realtime Socket.IO transport
  if (pathname.includes("socket.io")) return true;

  // 3. Never cache camera streams, RTSP feeds, or edge proxies
  if (
    pathname.includes("/cameras/stream") ||
    pathname.includes("/rtsp") ||
    pathname.includes("/live")
  ) {
    return true;
  }

  // 4. Never cache evidence snapshots or bursts
  if (
    pathname.includes("/evidence") ||
    pathname.includes("/snapshots") ||
    pathname.includes("/bursts")
  ) {
    return true;
  }

  // 5. Never cache requests with Authorization header
  if (request.headers.has("Authorization")) return true;

  // 6. Never cache Vite HMR, development modules, or tokenized development requests
  if (
    pathname.startsWith("/@") ||
    pathname.includes("@vite") ||
    pathname.includes("__vite") ||
    pathname.includes("node_modules") ||
    url.searchParams.has("token") ||
    url.searchParams.has("ticket")
  ) {
    return true;
  }

  // 7. Only cache GET requests
  if (request.method !== "GET") return true;

  return false;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(APP_SHELL_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(() => {
        // Continue installation even if individual optional assets fail
        return self.skipWaiting();
      })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
            return null;
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Cross-origin and non-http(s) requests bypass service worker
  if (!url.protocol.startsWith("http")) return;

  // Security guard: Sensitive requests bypass cache unconditionally
  if (isSensitiveRequest(url, request)) {
    return; // Natural network fetch without SW interception
  }

  // For SPA page navigations: Network first, fallback to cached index.html
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedIndex = await cache.match("/index.html");
        return cachedIndex || Response.error();
      })
    );
    return;
  }

  // For static app assets (JS, CSS, SVGs, Fonts): Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === "basic"
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});
