// ----------------------------------------------------------------------------
// Library persistence layer for Watch Later + History.
//
// Everything is stored in localStorage (no backend yet). A lightweight custom
// event broadcasts changes so any component can re-read the latest state and
// stay in sync (e.g. a bookmark toggled on one card updates all cards).
// ----------------------------------------------------------------------------

const WATCH_LATER_KEY = 'flixhub.watchLater';
const HISTORY_KEY = 'flixhub.history';
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
  return {
    id: movie.id,
    title: movie.title || movie.name || 'Untitled',
    name: movie.name,
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
export function logPlayed(movie) {
  if (!movie?.id) return;
  let items = getHistory().filter((e) => e.movie.id !== movie.id);
  items.unshift({ movie: snapshot(movie), watchedAt: Date.now() });
  if (items.length > MAX_HISTORY) items = items.slice(0, MAX_HISTORY);
  writeJSON(HISTORY_KEY, items);
}

export function removeFromHistory(id) {
  writeJSON(HISTORY_KEY, getHistory().filter((e) => e.movie.id !== id));
}

export function clearHistory() {
  writeJSON(HISTORY_KEY, []);
}