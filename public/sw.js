/* Service worker for the ShitStickAdventure web portal.
 *
 * Strategy:
 *  - App shell ('/', fonts, icons, manifest): precached at install, then
 *    network-first for navigations (so dev/prod updates land) with cache
 *    fallback for offline relaunch.
 *  - Game files (/game/*): served cache-first from the "game" cache, which is
 *    filled by the portal's explicit download flow (with progress UI).
 *    When online and not yet cached, requests fall through to the network so
 *    the game also works without pre-downloading.
 *  - /_next/static and other same-origin GETs: stale-while-revalidate into the
 *    shell cache so the app works offline after the first visit.
 */

const SHELL_CACHE = "ssa-shell-v1";
const GAME_CACHE = "ssa-game-v2";

const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/game-icon.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  "/fonts/mplus-1m-regular.woff",
  "/fonts/mplus-2p-bold-sub.woff",
  "/game/game-files.json",
  "/game/index.html",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(
        SHELL_ASSETS.map((url) => cache.add(new Request(url, { cache: "reload" })))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== GAME_CACHE)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (data.type === "CLEAR_GAME_CACHE") {
    event.waitUntil(
      (async () => {
        await caches.delete(GAME_CACHE);
        const clients = await self.clients.matchAll();
        for (const client of clients) {
          client.postMessage({ type: "GAME_CACHE_CLEARED" });
        }
      })()
    );
  }
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok && response.type === "basic") {
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === "basic") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);
  return cached || (await network) || Response.error();
}

async function handleNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    const shell = await cache.match("/", { ignoreVary: true });
    if (shell) return shell;
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  // The manifest is the version anchor: always prefer the network so users
  // learn about updated game payloads.
  if (url.pathname === "/game/game-files.json") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response && response.ok) {
            const cache = await caches.open(GAME_CACHE);
            cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cache = await caches.open(GAME_CACHE);
          const cached = await cache.match(request, { ignoreVary: true });
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  if (url.pathname.startsWith("/game/")) {
    event.respondWith(cacheFirst(request, GAME_CACHE));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/") ||
    url.pathname === "/game-icon.png" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }
});
