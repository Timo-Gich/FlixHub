/* FlixHub service worker — offline shell + app installability (PWA).
 * Strategy:
 *   • Same-origin GET requests (static assets + navigations) are cache-first
 *     with a background refresh, so the app shell works offline.
 *   • Third-party / API traffic (TMDb, VidKing) is NEVER intercepted.
 *   • Vite dev paths are bypassed so the dev server stays fresh.
 */
const CACHE = 'flixhub-v1';
const CORE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];
const DEV_PREFIXES = ['/src/', '/@', '/.vite/'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precacheCore());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Never cache third-party (TMDb API, VidKing player) requests.
  if (url.origin !== self.location.origin) return;
  // Keep the dev server / hot-reload fresh.
  if (DEV_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  event.respondWith(fromCacheOrNetwork(req));
});

/* Register the app shell in the cache on install. */
async function precacheCore() {
  const cache = await caches.open(CACHE);
  await Promise.all(
    CORE.map(async (path) => {
      try {
        const res = await fetch(path);
        if (res.ok) cache.put(path, res.clone());
      } catch {
        /* ignore — first runtime request will populate */
      }
    }),
  );
}

/* Cache-first with background refresh; falls back to network if uncached. */
async function fromCacheOrNetwork(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) {
    try {
      const fresh = await fetch(req);
      if (fresh.ok) cache.put(req, fresh.clone());
    } catch {
      /* offline — keep serving the cached copy */
    }
    return cached;
  }
  const network = await fetch(req);
  if (network.ok && network.type === 'basic') cache.put(req, network.clone());
  return network;
}