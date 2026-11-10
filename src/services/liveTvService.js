// ----------------------------------------------------------------------------
// Live TV data layer: lightweight client for the dedicated Live TV backend.
//
// The backend fetches and parses M3U/XMLTV data, caches it, and proxies HLS
// manifests and segments. The browser only requests channel/guide subsets.
// ----------------------------------------------------------------------------

const LIVE_TV_API_BASE = (import.meta.env.VITE_LIVE_TV_API_URL || '/live-tv-api')
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

// --- EPG (XMLTV) -------------------------------------------------------------

/**
 * Countries with friendly labels for selectors. The backend can fetch EPG data
 * by ISO-2 country code even when a code is not listed here.
 */
export const EPG_REGIONS = [
  { code: 'US', label: 'United States', folder: 'Usa' },
  { code: 'GB', label: 'United Kingdom', folder: 'Unitedkingdom' },
  { code: 'CA', label: 'Canada', folder: 'Canada' },
  { code: 'AU', label: 'Australia', folder: 'Australia' },
  { code: 'FR', label: 'France', folder: 'France' },
  { code: 'DE', label: 'Germany', folder: 'Germany' },
  { code: 'ES', label: 'Spain', folder: 'Spain' },
  { code: 'IT', label: 'Italy', folder: 'Italy' },
  { code: 'NL', label: 'Netherlands', folder: 'Netherlands' },
  { code: 'BE', label: 'Belgium', folder: 'Belgium' },
  { code: 'CH', label: 'Switzerland', folder: 'Switzerland' },
  { code: 'AT', label: 'Austria', folder: 'Austria' },
  { code: 'PT', label: 'Portugal', folder: 'Portugal' },
  { code: 'SE', label: 'Sweden', folder: 'Sweden' },
  { code: 'NO', label: 'Norway', folder: 'Norway' },
  { code: 'DK', label: 'Denmark', folder: 'Denmark' },
  { code: 'FI', label: 'Finland', folder: 'Finland' },
  { code: 'PL', label: 'Poland', folder: 'Poland' },
  { code: 'GR', label: 'Greece', folder: 'Greece' },
  { code: 'IE', label: 'Ireland', folder: 'Ireland' },
  { code: 'BR', label: 'Brazil', folder: 'Brazil' },
  { code: 'MX', label: 'Mexico', folder: 'Mexico' },
  { code: 'AR', label: 'Argentina', folder: 'Argentina' },
  { code: 'CL', label: 'Chile', folder: 'Chile' },
  { code: 'CO', label: 'Colombia', folder: 'Colombia' },
  { code: 'IN', label: 'India', folder: 'India' },
  { code: 'JP', label: 'Japan', folder: 'Japan' },
  { code: 'KR', label: 'South Korea', folder: 'Korea' },
  { code: 'TR', label: 'Turkey', folder: 'Turkey' },
  { code: 'RU', label: 'Russia', folder: 'Russia' },
  { code: 'NG', label: 'Nigeria', folder: 'Nigeria' },
  { code: 'SA', label: 'Saudi Arabia', folder: 'Saudiarabia' },
  { code: 'NZ', label: 'New Zealand', folder: 'Newzealand' },
];

/** Map ISO codes -> display regions for quick lookups. */
const REGION_BY_CODE = EPG_REGIONS.reduce((acc, r) => {
  acc[r.code.toLowerCase()] = r;
  acc[r.code] = r;
  return acc;
}, {});

/** Fallback region used when the country code is absent or invalid. */
export const DEFAULT_EPG_REGION = 'US';

export function getRegionByCode(code) {
  const normalized = String(code || '').toUpperCase();
  const alias = normalized === 'UK' ? 'GB' : normalized;
  return REGION_BY_CODE[alias] ??
    (/^[A-Z]{2}$/.test(alias)
      ? { code: alias, label: alias }
      : REGION_BY_CODE[DEFAULT_EPG_REGION]);
}

/**
 * Resolve an EPG region from a channel's ISO-2 country code (the code derived
 * from its tvg-id). This lets deep-linked channels auto-derive a matching EPG
 * stint instead of relying only on the user's selected region. UK channels use
 * the ".uk" suffix, which we alias to the "GB" region. Returns null when the
 * country code is not an ISO-2 code.
 * @param {string} country
 * @returns {{ code:string, label:string, folder?:string }|null}
 */
export function getRegionForCountry(country) {
  const cc = String(country || '').toLowerCase();
  const alias = cc === 'uk' ? 'gb' : cc;
  if (!/^[a-z]{2}$/.test(alias)) return null;
  return getRegionByCode(alias);
}

/** Build the XMLTV URL for the selected country code. */
export function epgUrlFor(region) {
  const code = getRegionByCode(region?.code || DEFAULT_EPG_REGION).code;
  return `https://epg.pw/xmltv/epg_${code}.xml`;
}

function normalizeKey(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Request a bounded, channel-filtered guide from the backend.
 * @param {string} regionCode
 * @param {{ signal?: AbortSignal, channels?: LiveChannel[], from?: number, to?: number }} [opts]
 */
export async function fetchEPG(regionCode = DEFAULT_EPG_REGION, opts = {}) {
  const channels = (opts.channels || []).map(({ tvgId, name }) => ({ tvgId, name }));
  if (!channels.length) return {};
  const now = Date.now();
  const response = await fetch(liveTvApiUrl('/api/epg'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: opts.signal,
    body: JSON.stringify({
      country: getRegionByCode(regionCode).code,
      channels,
      from: opts.from ?? now - 60 * 60 * 1000,
      to: opts.to ?? now + 12 * 60 * 60 * 1000,
    }),
  });
  if (!response.ok) throw new Error(`Live TV EPG backend returned ${response.status}`);
  const payload = await response.json();
  if (!payload.programmes || typeof payload.programmes !== 'object') {
    throw new Error('Invalid EPG response from Live TV backend');
  }
  return payload.programmes;
}

/**
 * Resolve the current + next programme for a channel from an EPG map.
 * Matches strictly by tvg-id first, then by a normalized-name fallback.
 *
 * @param {Record<string, Array<{startMs:number,stopMs:number,title:string}>>} epgMap
 * @param {string} tvgId
 * @param {string} channelName
 * @param {number} [refTime]
 * @returns {{ now: object|null, next: object|null, timeMs: number, found: boolean }}
 */
export function matchProgrammes(epgMap, tvgId, channelName, refTime = Date.now()) {
  // A tvg-id like "BloombergTV.us@US" rarely matches the EPG channel key
  // ("BloombergTV.us"), so we build candidate base ids by stripping the
  // `@provider` suffix before comparing.
  const baseId = String(tvgId || '').split('@')[0];
  const candidates = [tvgId, baseId];

  let entries;
  const keys = Object.keys(epgMap || {});
  // 1) exact key, then exact base id.
  for (const c of candidates) {
    if (epgMap[c]) {
      entries = epgMap[c];
      break;
    }
  }
  // 2) normalized-key comparison across all EPG keys (case/punctuation-insensitive).
  if (!entries) {
    const wanted = candidates.map(normalizeKey).filter(Boolean);
    const key = keys.find((k) => {
      const nk = normalizeKey(k);
      return wanted.includes(nk) || wanted.some((n) => nk === n || nk.startsWith(`${n}@`));
    });
    if (key) entries = epgMap[key];
  }

  let found = !!entries && entries.length > 0;
  // 3) loose normalized channel-name fallback (handles renamed channels).
  if (!entries) {
    const nName = normalizeKey(channelName);
    if (nName) {
      const ch = keys.find((k) => {
        const nk = normalizeKey(k);
        return nk.length >= 3 && (nk.includes(nName) || nName.includes(nk));
      });
      if (ch) entries = epgMap[ch];
      found = !!ch;
    }
  }

  let now = null;
  let next = null;
  for (const e of entries || []) {
    if (e.startMs <= refTime && refTime < e.stopMs) {
      if (!now || e.startMs > now.startMs) now = e;
    }
    if (e.startMs >= refTime && (!next || e.startMs < next.startMs)) {
      if (e !== now) next = e;
    }
  }
  // Covers a scheduling gap: surface the nearest upcoming programme.
  if (!next) {
    for (const e of entries || []) {
      if (e.startMs >= refTime && (!next || e.startMs < next.startMs)) next = e;
    }
  }

  return { now, next, timeMs: refTime, found };
}

/**
 * Request the channel-filtered schedules for a small set of countries.
 * @param {string[]} codes
 * @returns {Promise<Record<string, Record<string, Array>>>>} code -> epgMap
 */
export async function fetchEPGForRegions(codes = [], opts = {}) {
  const uniq = [...new Set((codes || []).map((c) => String(c || '').toUpperCase()).filter(Boolean))];
  const out = {};
  await Promise.all(uniq.map(async (code) => {
    try {
      out[code] = await fetchEPG(code, opts);
    } catch (error) {
      console.error(`[live-tv] could not load ${code} EPG from backend:`, error);
      out[code] = {};
    }
  }));
  return out;
}

/**
 * Resolve now/next for a channel across several region maps, preferring the
 * first region that actually has schedule data.
 */
export function getNowNextAcrossRegions(epgMaps, channel, refTime = Date.now()) {
  if (!channel) return { now: null, next: null, found: false, region: null, entries: [] };
  for (const code of Object.keys(epgMaps || {})) {
    const map = epgMaps[code];
    if (!map || !Object.keys(map).length) continue;
    const res = matchProgrammes(map, channel.tvgId, channel.name, refTime);
    if (res.found && (res.now || res.next)) {
      return { ...res, region: getRegionByCode(code), entries: mapEntriesFor(map, channel) };
    }
  }
  for (const code of Object.keys(epgMaps || {})) {
    const map = epgMaps[code];
    if (!map || !Object.keys(map).length) continue;
    const res = matchProgrammes(map, channel.tvgId, channel.name, refTime);
    return { ...res, region: getRegionByCode(code), entries: mapEntriesFor(map, channel) };
  }
  return { now: null, next: null, found: false, region: null, entries: [] };
}

function mapEntriesFor(map, channel) {
  const baseId = String(channel?.tvgId || '').split('@')[0];
  if (map[channel?.tvgId]) return map[channel.tvgId];
  if (baseId && map[baseId]) return map[baseId];
  return [];
}

/** Progress 0..1 of a programme at refTime. Null when unknown. */
export function programmeProgress(prog, refTime = Date.now()) {
  if (!prog || !Number.isFinite(prog.startMs) || !Number.isFinite(prog.stopMs)) return null;
  const total = prog.stopMs - prog.startMs;
  if (total <= 0) return null;
  return Math.min(1, Math.max(0, (refTime - prog.startMs) / total));
}

/** Next N upcoming programmes after `from` for the guide rail. */
export function getUpcoming(entries = [], from = null, limit = 4) {
  const ref = from ? from.stopMs ?? from.startMs ?? Date.now() : Date.now();
  return (entries || [])
    .filter((e) => e.startMs >= ref - 60000)
    .filter((e) => (from ? e !== from : true))
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, limit);
}

/** Programmes overlapping [winStart, winEnd) for one guide row. */
export function sliceWindow(entries = [], winStart = 0, winEnd = 0) {
  return (entries || [])
    .filter((e) => e.stopMs > winStart && e.startMs < winEnd)
    .sort((a, b) => a.startMs - b.startMs);
}

/**
 * Pick featured "On Now" channels: has logo + has a current programme,
 * preferring editorial categories. Returns at most `limit`.
 */
export function pickFeaturedOnNow(channels = [], epgByChannel = new Map(), limit = 8) {
  const prefer = ['News', 'Sports', 'Movies', 'Entertainment', 'Music'];
  const scored = [];
  for (const ch of channels) {
    const info = epgByChannel.get(ch.id);
    if (!info?.now || !ch.logo) continue;
    const catIdx = prefer.indexOf(ch.category);
    scored.push({ ch, info, score: catIdx === -1 ? prefer.length : catIdx });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit);
}

export function formatClock(ms) {
  if (!ms || !Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatRange(startMs, stopMs) {
  const a = formatClock(startMs);
  const b = formatClock(stopMs);
  return a && b ? `${a} – ${b}` : a || b || '';
}