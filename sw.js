const APP_VERSION = "0.1.3";
const SHELL_CACHE = `pwd-shell-${APP_VERSION}`;
const RUNTIME_CACHE = "pwd-runtime-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./ai.js",
  "./ai-worker.js",
  "./cpu-worker.js",
  "./pwa.js",
  "./manifest.webmanifest",
  "./version.json",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith("pwd-shell-") && k !== SHELL_CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(event.request, { cache: "no-store" });
        const cache = await caches.open(SHELL_CACHE);
        cache.put(event.request, fresh.clone());
        return fresh;
      } catch (_) {
        return (await caches.match(event.request)) || (await caches.match("./index.html"));
      }
    })());
    return;
  }

  if (url.hostname === "esm.run" || url.hostname === "cdn.jsdelivr.net") {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(event.request, response.clone());
      return response;
    })());
  }
});