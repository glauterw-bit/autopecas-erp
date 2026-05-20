// Service Worker — AutoPeças ERP Mobile
// Cache-first para assets estáticos, network-first para API.
// Suporta funcionamento offline básico (catálogo recentemente consultado).

const VERSION = "v1.0.0";
const STATIC_CACHE = `autopecas-static-${VERSION}`;
const API_CACHE = `autopecas-api-${VERSION}`;
const STATIC_ASSETS = ["/m", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((c) => c.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== API_CACHE)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) {
    // network-first com fallback de cache
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          const clone = resp.clone();
          caches.open(API_CACHE).then((c) => c.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  // cache-first para o resto
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached ||
      fetch(event.request).then((resp) => {
        if (resp.ok && event.request.method === "GET") {
          const clone = resp.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(event.request, clone));
        }
        return resp;
      }),
    ),
  );
});

// Background sync: vendas offline criadas no PWA sincronizam quando volta
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-vendas-offline") {
    event.waitUntil(sincronizarVendasOffline());
  }
});

async function sincronizarVendasOffline() {
  const cache = await caches.open("autopecas-offline-queue");
  const reqs = await cache.keys();
  for (const req of reqs) {
    const resp = await cache.match(req);
    if (!resp) continue;
    const body = await resp.text();
    try {
      await fetch(req, { method: "POST", body });
      await cache.delete(req);
    } catch {
      /* falhou - tenta de novo no próximo sync */
    }
  }
}
