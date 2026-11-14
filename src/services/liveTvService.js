// ----------------------------------------------------------------------------
// Live TV data layer: lightweight client for the dedicated Live TV backend.
//
// The backend fetches and parses the M3U playlist, caches channel metadata, and
// proxies HLS manifests and segments.
// ----------------------------------------------------------------------------

const LIVE_TV_API_BASE = (import.meta.env.LIVE_TV_API_URL || '/live-tv-api')
  .trim()
  .replace(/\/+$/, '');
let playlistCache = null;
let playlistFetchedAt = 0;
const PLAYLIST_CACHE_TTL_MS = 5 * 60 * 1000;

export function liveTvApiUrl(path) {
  return `${LIVE_TV_API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * A single live channel parsed from the playlist.
 * @typedef {Object} LiveChannel
 * @property {string} id        - stable, URL-safe id used in /live/:channelId
 * @property {string} name
 * @property {string} logo      - tvg-logo (may be empty)
 * @property {string} category  - group-title
 * @property {string} country   - ISO-2 country code derived from tvg-id (may be '')
 * @property {string} streamUrl - backend HLS manifest URL
 * @property {string} tvgId     - the tvg-id attribute
 */

/**
 * Fetch channel metadata from the Live TV backend. The upstream M3U file is
 * downloaded, parsed, and cached server-side.
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<LiveChannel[]>}
 */
export async function fetchPlaylist(opts = {}) {
  if (playlistCache && Date.now() - playlistFetchedAt < PLAYLIST_CACHE_TTL_MS) return playlistCache;
  try {
    const response = await fetch(liveTvApiUrl('/api/channels'), { signal: opts.signal });
    if (!response.ok) throw new Error(`Live TV backend returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.channels)) throw new Error('Invalid channel response from Live TV backend');
    playlistCache = payload.channels.map((channel) => ({
      ...channel,
      streamUrl: liveTvApiUrl(channel.streamUrl),
    }));
    playlistFetchedAt = Date.now();
    return playlistCache;
  } catch (error) {
    console.error('[live-tv] could not load channels from backend:', error);
    return [];
  }
}

/** Drop the small metadata cache (e.g. for a manual "try again"). */
export function resetPlaylistCache() {
  playlistCache = null;
  playlistFetchedAt = 0;
}

/**
 * @param {LiveChannel} channel
 * @returns {string} proxied URL the player should load.
 */
export function buildStreamUrl(channel) {
  return channel?.streamUrl || '';
}
