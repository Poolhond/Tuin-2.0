const SHELL_CACHE = "tuinlog-shell-v1";
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./app.css",
  "./manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const uniqueAssets = [...new Set(SHELL_ASSETS)];
    for (const asset of uniqueAssets) {
      try {
        await cache.add(asset);
      } catch {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => (key === SHELL_CACHE ? null : caches.delete(key))));
    await self.clients.claim();
  })());
});

function isNavigationRequest(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(SHELL_CACHE);
        cache.put(request, networkResponse.clone()).catch(() => {});
        return networkResponse;
      } catch {
        const cachedIndex = await caches.match("./index.html", { ignoreSearch: true });
        if (cachedIndex) return cachedIndex;
        return new Response("Offline", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const networkResponse = await fetch(request);
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, networkResponse.clone()).catch(() => {});
      return networkResponse;
    } catch {
      return new Response("Offline", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
  })());
});
