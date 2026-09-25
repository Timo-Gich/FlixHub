// ----------------------------------------------------------------------------
// Per-series season memory.
//
// Streaming apps remember the season you last had open on a series detail page
// and restore it when you come back, so pressing "Back" from the player lands
// you on the same season (not always Season 1). We persist per series in
// localStorage so it survives navigation and app restarts.
// ----------------------------------------------------------------------------

const PREFIX = 'flixhub.lastSeason.';

/**
 * Remember the last selected season for a series so the detail page can reopen
 * it next time. Passing a null/invalid season clears it.
 * @param {number|string} id            TV series id
 * @param {number}        seasonNumber  the season to remember (or null)
 */
export function saveLastSeason(id, seasonNumber) {
  if (id == null || Number.isNaN(Number(id))) return;
  try {
    if (seasonNumber == null) {
      localStorage.removeItem(PREFIX + id);
    } else {
      localStorage.setItem(PREFIX + id, String(seasonNumber));
    }
  } catch {
    /* storage unavailable — ignore */
  }
}

/**
 * The last selected season for a series, or null when none has been saved.
 * @param {number|string} id  TV series id
 * @returns {number|null}
 */
export function getLastSeason(id) {
  if (id == null || Number.isNaN(Number(id))) return null;
  try {
    const raw = localStorage.getItem(PREFIX + id);
    if (raw == null) return null;
    const season = Number(raw);
    return Number.isNaN(season) ? null : season;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------------------
// Per-series "watched episodes" memory.
//
// The watch history only stores the single most recent episode per title, so it
// can't answer "which episodes have I seen?". This lightweight per-series map
// (season → [episode numbers]) is updated when an episode is played, letting the
// detail page show a small check on episodes the user already watched.
// ----------------------------------------------------------------------------

const WATCHED_PREFIX = 'flixhub.watched.';

/**
 * Episodes already watched for a series, keyed by season number.
 * @param {number|string} id  TV series id
 * @returns {Record<string, number[]>} e.g. { "2": [1, 2, 3] }
 */
export function getWatchedEpisodes(id) {
  if (id == null || Number.isNaN(Number(id))) return {};
  try {
    const raw = localStorage.getItem(WATCHED_PREFIX + id);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Record that a specific episode was watched so the series detail page can show
 * it as seen. Adds to the list once (idempotent per episode).
 * @param {number|string} id  TV series id
 * @param {number}        season
 * @param {number}        episode
 */
export function markEpisodeWatched(id, season, episode) {
  if (id == null || Number.isNaN(Number(id))) return;
  if (season == null || episode == null) return;
  const all = getWatchedEpisodes(id);
  const key = String(season);
  const list = all[key] ? [...all[key]] : [];
  if (!list.includes(episode)) list.push(episode);
  all[key] = list;
  try {
    localStorage.setItem(WATCHED_PREFIX + id, JSON.stringify(all));
  } catch {
    /* storage unavailable — ignore */
  }
}