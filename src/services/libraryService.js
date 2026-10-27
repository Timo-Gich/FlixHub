// ----------------------------------------------------------------------------
// Library persistence layer for Watch Later + History.
//
// Guest library data and the signed-in Supabase mirror share these localStorage
// keys. Signed-in writes use cache helpers only after their cloud write succeeds.
// ----------------------------------------------------------------------------

const WATCH_LATER_KEY = 'flixhub.watchLater';
const HISTORY_KEY = 'flixhub.history';
const FAVORITES_LIVE_KEY = 'flixhub.favoritesLive';
const GUEST_LIBRARY_PENDING_KEY = 'flixhub.guestLibraryPending';
const CHANGE_EVENT = 'flixhub:library';

// Hard cap for history — oldest entries are trimmed past this.
export const MAX_HISTORY = 200;

// A watch counts as "finished" once progress reaches ~98% of its duration. Used
// by Continue Watching ordering and the player's Back-link auto-advance decision.
export const FINISH_THRESHOLD = 0.98;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value, guestChange = true) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    if (guestChange) localStorage.setItem(GUEST_LIBRARY_PENDING_KEY, '1');
  } catch {
    // storage may be full/blocked; fail silently rather than crashing the UI
  }
  notifyChange();
}

function historyKey(entry) {
  return `${entry?.movie?.id}|${entry?.season ?? 0}|${entry?.episode ?? 0}`;
}

function updateCacheList(key, update) {
  const next = update(readJSON(key, []));
  writeJSON(key, next, false);
}

export function replaceWatchLaterCache(items) {
  writeJSON(WATCH_LATER_KEY, items, false);
}

export function replaceHistoryCache(items) {
  writeJSON(HISTORY_KEY, items, false);
}

export function replaceFavoritesLiveCache(items) {
  writeJSON(FAVORITES_LIVE_KEY, items, false);
}

export function upsertWatchLaterCache(entry) {
  updateCacheList(WATCH_LATER_KEY, (items) => [
    entry,
    ...items.filter((item) => item?.movie?.id !== entry?.movie?.id),
  ]);
}

export function removeWatchLaterCache(id) {
  updateCacheList(WATCH_LATER_KEY, (items) => items.filter((item) => item?.movie?.id !== id));
}

export function upsertHistoryCache(entry) {
  updateCacheList(HISTORY_KEY, (items) => {
    const key = historyKey(entry);
    return [entry, ...items.filter((item) => historyKey(item) !== key)].slice(0, MAX_HISTORY);
  });
}

export function replaceHistoryForMediaCache(id, entries) {
  updateCacheList(HISTORY_KEY, (items) => [
    ...entries,
    ...items.filter((item) => item?.movie?.id !== id),
  ].slice(0, MAX_HISTORY));
}

export function removeHistoryCache(id) {
  updateCacheList(HISTORY_KEY, (items) => items.filter((item) => item?.movie?.id !== id));
}

export function clearHistoryCache() {
  replaceHistoryCache([]);
}

export function upsertFavoritesLiveCache(entry) {
  const key = entry?.channel?.id ?? entry?.channel?.name;
  updateCacheList(FAVORITES_LIVE_KEY, (items) => [
    entry,
    ...items.filter((item) => (item?.channel?.id ?? item?.channel?.name) !== key),
  ]);
}

export function removeFavoritesLiveCache(id) {
  updateCacheList(FAVORITES_LIVE_KEY, (items) => (
    items.filter((item) => (item?.channel?.id ?? item?.channel?.name) !== id)
  ));
}

export function hasPendingGuestLibrary() {
  try {
    return localStorage.getItem(GUEST_LIBRARY_PENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearPendingGuestLibrary() {
  try {
    localStorage.removeItem(GUEST_LIBRARY_PENDING_KEY);
  } catch {
    // storage may be blocked
  }
}

export function clearLibraryCache() {
  [WATCH_LATER_KEY, HISTORY_KEY, FAVORITES_LIVE_KEY, GUEST_LIBRARY_PENDING_KEY].forEach((key) => {
    try { localStorage.removeItem(key); } catch { /* storage may be blocked */ }
  });
  notifyChange();
}

function notifyChange() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Subscribe to library changes. Returns an unsubscribe function. */
export function subscribeLibrary(cb) {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

/** Minimal, stable snapshot of a movie enough to render a card without refetching. */
function snapshot(movie) {
  // Preserve which media type this is so cards can link to the right detail
  // page. TMDb TV objects expose `name` (not `title`), which also lets us
  // infer the type when media_type is missing.
  const isTv = movie.media_type === 'tv' || (movie.name && !movie.title);
  return {
    id: movie.id,
    title: movie.title || movie.name || 'Untitled',
    name: movie.name,
    media_type: movie.media_type || (isTv ? 'tv' : 'movie'),
    poster_path: movie.poster_path,
    backdrop_path: movie.backdrop_path,
    release_date: movie.release_date,
    first_air_date: movie.first_air_date,
    vote_average: movie.vote_average,
    original_language: movie.original_language,
    overview: movie.overview,
  };
}

// --- Watch Later -------------------------------------------------------------

/** @returns {Array<{ movie: object, savedAt: number }>} newest saved first */
export function getWatchLater() {
  return readJSON(WATCH_LATER_KEY, []);
}

export function isSaved(id) {
  return getWatchLater().some((e) => e.movie.id === id);
}

/** Add or remove a movie from Watch Later. Returns the new "saved" state. */
export function toggleWatchLater(movie) {
  if (!movie?.id) return false;
  const items = getWatchLater();
  const exists = items.some((e) => e.movie.id === movie.id);
  if (exists) {
    writeJSON(WATCH_LATER_KEY, items.filter((e) => e.movie.id !== movie.id));
    return false;
  }
  items.unshift({ movie: snapshot(movie), savedAt: Date.now() });
  writeJSON(WATCH_LATER_KEY, items);
  return true;
}

export function removeFromWatchLater(id) {
  writeJSON(WATCH_LATER_KEY, getWatchLater().filter((e) => e.movie.id !== id));
}

// --- History ----------------------------------------------------------------

/** @returns {Array<{ movie: object, watchedAt: number }>} newest first */
export function getHistory() {
  return readJSON(HISTORY_KEY, []);
}

/**
 * Record a movie as played. Upserts by id (re-watching moves it to the front
 * rather than duplicating), then trims to MAX_HISTORY (oldest dropped).
 */
export function logPlayed(movie, opts = {}) {
  if (!movie?.id) return;
  const items = getHistory();
  // Pull out any existing entry for this title so a re-watch moves it to the
  // front (and keeps episode metadata) without discarding saved progress.
  const existing = items.find((e) => e.movie.id === movie.id);
  const merged = createPlayedEntry(movie, opts, existing);
  let next = [merged, ...items.filter((e) => e.movie.id !== movie.id)];
  if (next.length > MAX_HISTORY) next = next.slice(0, MAX_HISTORY);
  writeJSON(HISTORY_KEY, next);
  return merged;
}

export function createPlayedEntry(movie, opts = {}, existing) {
  const sameEpisode = existing
    && existing.type === (opts.type || undefined)
    && existing.season === opts.season
    && existing.episode === opts.episode;
  const entry = {
    movie: snapshot(movie),
    watchedAt: Date.now(),
    progressSeconds: sameEpisode ? existing.progressSeconds || 0 : 0,
    durationSeconds: Math.round((movie.runtime || 0) * 60),
    type: opts.type,
    season: opts.season,
    episode: opts.episode,
  };
  if (!entry.durationSeconds && existing?.durationSeconds) {
    entry.durationSeconds = existing.durationSeconds;
  }
  return entry;
}

/**
 * Update how far a movie was watched (in seconds). Only ever stores increases,
 * so a quick visit or scrubbing backwards never reduces progress.
 *
 * When `opts.season`/`opts.episode` are provided (TV), the write only lands on
 * the history entry for that exact episode. This stops one episode's leftover
 * timer from stamping its seconds onto the next episode's entry (they share the
 * same series id).
 */
export function updateWatchProgress(id, seconds, durationSeconds, opts = {}) {
  if (id == null) return;
  const result = withWatchProgress(getHistory(), id, seconds, durationSeconds, opts);
  if (result.changed) writeJSON(HISTORY_KEY, result.items);
}

export function withWatchProgress(items, id, seconds, durationSeconds, opts = {}) {
  if (id == null) return { items, changed: false };
  const { season, episode } = opts;
  let changed = false;
  const next = items.map((entry) => {
    if (entry.movie.id !== id) return entry;
    if (season != null && (entry.season !== season || entry.episode !== episode)) return entry;
    if (seconds > (entry.progressSeconds || 0)) {
      changed = true;
      return {
        ...entry,
        progressSeconds: Math.round(seconds),
        durationSeconds: durationSeconds || entry.durationSeconds || 0,
        updatedAt: Date.now(),
      };
    }
    return entry;
  });
  return { items: changed ? next : items, changed };
}

export function removeFromHistory(id) {
  writeJSON(HISTORY_KEY, getHistory().filter((e) => e.movie.id !== id));
}

export function clearHistory() {
  writeJSON(HISTORY_KEY, []);
}

// --- Live TV Favorites -------------------------------------------------------

/**
 * Live TV favorites live in their own localStorage list so they can be surfaced
 * in the "Favorites" tab of the Live TV browser without ever touching the Watch
 * Later or History lists (those are reserved for on-demand movies / series).
 */

/**
 * @returns {Array<{ channel: object, savedAt: number }>} newest saved first
 */
export function getFavoritesLive() {
  return readJSON(FAVORITES_LIVE_KEY, []);
}

export function isFavLive(id) {
  return getFavoritesLive().some((e) => e.channel?.id === id);
}

/**
 * Add or remove a live channel from favorites. Stores a minimal snapshot of the
 * channel (id, name, logo, category, country, streamUrl, tvgId) so a card can be
 * rendered from favorites alone. Returns the new "saved" state.
 */
export function toggleFavLive(channel) {
  if (!channel?.id) return false;
  // Keep only the stable fields needed to render a card / re-open the player.
  const snapshot = {
    id: channel.id,
    name: channel.name,
    logo: channel.logo,
    category: channel.category,
    country: channel.country,
    streamUrl: channel.streamUrl,
    tvgId: channel.tvgId,
    userAgent: channel.userAgent || '',
  };
  const items = getFavoritesLive();
  const exists = items.some((e) => e.channel?.id === snapshot.id);
  if (exists) {
    writeJSON(FAVORITES_LIVE_KEY, items.filter((e) => e.channel?.id !== snapshot.id));
    return false;
  }
  items.unshift({ channel: snapshot, savedAt: Date.now() });
  writeJSON(FAVORITES_LIVE_KEY, items);
  return true;
}

export function removeFavLive(id) {
  writeJSON(FAVORITES_LIVE_KEY, getFavoritesLive().filter((e) => e.channel?.id !== id));
}