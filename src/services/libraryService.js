// ----------------------------------------------------------------------------
// Library persistence layer for Watch Later + History.
//
// Everything is stored in localStorage (no backend yet). A lightweight custom
// event broadcasts changes so any component can re-read the latest state and
// stay in sync (e.g. a bookmark toggled on one card updates all cards).
// ----------------------------------------------------------------------------

const WATCH_LATER_KEY = 'flixhub.watchLater';
const HISTORY_KEY = 'flixhub.history';
const FAVORITES_LIVE_KEY = 'flixhub.favoritesLive';
const CHANGE_EVENT = 'flixhub:library';

// Hard cap for history — oldest entries are trimmed past this.
export const MAX_HISTORY = 200;

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage may be full/blocked; fail silently rather than crashing the UI
  }
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
  // Re-logging the exact same episode (or a movie) should keep the progress
  // bar; switching to a different episode resets it so it tracks the new one.
  const sameEpisode =
    existing &&
    existing.type === (opts.type || undefined) &&
    existing.season === opts.season &&
    existing.episode === opts.episode;
  const merged = {
    movie: snapshot(movie),
    watchedAt: Date.now(),
    progressSeconds: sameEpisode ? existing.progressSeconds || 0 : 0,
    durationSeconds: Math.round((movie.runtime || 0) * 60),
    type: opts.type,
    season: opts.season,
    episode: opts.episode,
  };
  // Keep a prior (non-zero) duration when the fresh title reports none (e.g.
  // most TV series have no `runtime`), so Continue Watching still knows a length.
  if (!merged.durationSeconds && existing?.durationSeconds) {
    merged.durationSeconds = existing.durationSeconds;
  }
  let next = [merged, ...items.filter((e) => e.movie.id !== movie.id)];
  if (next.length > MAX_HISTORY) next = next.slice(0, MAX_HISTORY);
  writeJSON(HISTORY_KEY, next);
}

/**
 * Update how far a movie was watched (in seconds). Only ever stores increases,
 * so a quick visit or scrubbing backwards never reduces progress.
 */
export function updateWatchProgress(id, seconds, durationSeconds) {
  if (id == null) return;
  const items = getHistory();
  let changed = false;
  const next = items.map((e) => {
    if (e.movie.id === id && seconds > (e.progressSeconds || 0)) {
      changed = true;
      return {
        ...e,
        progressSeconds: Math.round(seconds),
        durationSeconds: durationSeconds || e.durationSeconds || 0,
        updatedAt: Date.now(),
      };
    }
    return e;
  });
  if (changed) writeJSON(HISTORY_KEY, next);
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