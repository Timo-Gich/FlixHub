/* FlixHub service worker — offline shell + app installability (PWA).
 * Strategy:
 *   • Same-origin static GETs (HTML/CSS/local JS/images/fonts) are cache-first
 *     with a background refresh, so the app shell works offline.
 *   • NEVER intercept: /api/* (resolve + Range-streamed media proxy),
 *     any request with a Range header, media (video/audio) destinations,
 *     Vite dev paths, or third-party / external player scripts.
 */
const CACHE = 'flixhub-v3';
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

  // Explicit network-only bypass: /api/* (resolver JSON + Range media proxy),
  // any Range request, media destinations, media extensions, third-party,
  // and Vite dev paths. respondWith(fetch()) guarantees the SW never serves
  // stale cache or opaque responses for these.
  const isApi = url.pathname.includes('/api/');
  const isMediaDest = req.destination === 'video' || req.destination === 'audio';
  const isMediaExt = /\.(m3u8|m4s|mp4|webm|ts)(\?|$)/i.test(url.pathname);
  const isThirdParty = url.origin !== self.location.origin;
  const isDev = DEV_PREFIXES.some((p) => url.pathname.startsWith(p));
  if (isApi || isMediaDest || req.headers.has('range') || isMediaExt || isThirdParty || isDev) {
    event.respondWith(fetch(req));
    return;
  }

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

/* Cache-first with background refresh; only stores safe static responses:
 * same-origin HTML/CSS/JS/images/fonts with 200 + no Range. Never stores
 * partial (206), opaque, or media payloads. */
async function fromCacheOrNetwork(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) {
    // Revalidate in background, but never store a 206 / partial response.
    try {
      const fresh = await fetch(req);
      if (fresh.ok && fresh.status === 200) {
        const ct = (fresh.headers.get('content-type') || '').toLowerCase();
        if (/text\/html|text\/css|javascript|json|image\/|font\//.test(ct)) {
          cache.put(req, fresh.clone());
        }
      }
    } catch {
      /* offline — keep serving the cached copy */
    }
    return cached;
  }
  const network = await fetch(req);
  if (network.ok && network.status === 200 && network.type === 'basic') {
    const ct = (network.headers.get('content-type') || '').toLowerCase();
    if (/text\/html|text\/css|javascript|json|image\/|font\//.test(ct)) {
      cache.put(req, network.clone());
    }
  }
  return network;
}