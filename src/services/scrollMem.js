// ----------------------------------------------------------------------------
// Session-scoped scroll memory.
//
// Professional streaming apps restore your place in a list when you press
// "back". We approximate that by remembering each route's scroll offset in
// sessionStorage — it survives in-tab navigation but is cleared when the tab
// (or app session) ends, so it never lingers between visits.
// ----------------------------------------------------------------------------

const PREFIX = 'flixhub.scroll.';

const PLAYER_PREFIXES = ['/watch', '/live/'];

/** True for full-screen players that shouldn't restore/save scroll. */
export function isPlayerPath(pathname) {
  return PLAYER_PREFIXES.some((seg) => pathname.startsWith(seg));
}

/** Persist the current page's vertical scroll offset for `pathname`. */
export function saveScroll(pathname) {
  try {
    sessionStorage.setItem(PREFIX + pathname, String(window.scrollY));
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Read the saved scroll offset for `pathname` (0 when none / unavailable). */
export function readScroll(pathname) {
  try {
    const raw = sessionStorage.getItem(PREFIX + pathname);
    return raw == null ? 0 : Number(raw);
  } catch {
    return 0;
  }
}

/** Remove any saved offset for `pathname`. */
export function clearScroll(pathname) {
  try {
    sessionStorage.removeItem(PREFIX + pathname);
  } catch {
    /* ignore */
  }
}