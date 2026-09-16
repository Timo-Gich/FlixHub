// ----------------------------------------------------------------------------
// IMDb search client for the IMDb search fallback.
//
// Calls the /api/imdb-search serverless proxy and caches results in
// localStorage keyed by the normalized query with a 24-hour TTL. A small
// id->item "lookup" map is also kept so the IMDb detail page can recover a
// title by imdbId after a refresh.
// ----------------------------------------------------------------------------

const CACHE_KEY = 'flixhub.imdbSearch';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function normalizeQuery(q) {
  return String(q || '').trim().toLowerCase();
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCache(map) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // storage may be full/blocked; fail silently
  }
}

/** Map of imdbId -> normalized IMDb item (used by the detail + watch pages). */
export function getImdbLookup() {
  return readCache().lookup || {};
}

/** Store a specific IMDb item for later lookup by id. */
export function cacheImdbItem(item) {
  if (!item?.imdbId) return;
  const map = readCache();
  const lookup = map.lookup || {};
  lookup[item.imdbId] = item;
  map.lookup = lookup;
  writeCache(map);
}

/**
 * Search IMDb via the serverless proxy, with a 24h localStorage cache.
 * Returns an array of { imdbId, title, year, poster, type, source: 'imdb' }.
 * Never throws — returns [] on any upstream or cache failure.
 */
export async function imdbSearch(query) {
  const q = normalizeQuery(query);
  if (!q) return [];

  const now = Date.now();
  const map = readCache();
  const cached = map[q];
  if (cached && Array.isArray(cached.items) && now - cached.ts < TTL_MS) {
    return cached.items;
  }

  let items = [];
  try {
    const res = await fetch(`/api/imdb-search?q=${encodeURIComponent(q)}`);
    if (res.ok) {
      const data = await res.json();
      items = Array.isArray(data) ? data : [];
    }
  } catch {
    items = [];
  }

  items = items.map((item) => ({ ...item, source: 'imdb' }));

  // Refresh the query cache and keep the id->item lookup warm for the detail page.
  const lookup = { ...(map.lookup || {}) };
  for (const item of items) lookup[item.imdbId] = item;
  map[q] = { ts: now, items };
  map.lookup = lookup;
  writeCache(map);

  return items;
}