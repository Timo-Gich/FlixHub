// ----------------------------------------------------------------------------
// Live TV data layer: M3U playlist + XMLTV (EPG) fetching and parsing.
//
// - fetchPlaylist()  : pulls the public iptv-org category playlist
//                      (https://iptv-org.github.io/iptv/index.category.m3u),
//                      parses the #EXTM3U format and returns LiveChannel[].
// - fetchEPG(region) : pulls XMLTV for the selected region from the globetvapp
//                      EPG repo and returns a map of programmes keyed by tvg-id
//                      so the player can resolve "now" / "next" for any channel.
// ----------------------------------------------------------------------------

export const PLAYLIST_URL = 'https://iptv-org.github.io/iptv/index.category.m3u';

// In-memory cache so the browser page and the player page don't re-download the
// (large) playlist on every navigation. Cleared automatically if it fails.
let playlistCache = null;

/**
 * A single live channel parsed from the playlist.
 * @typedef {Object} LiveChannel
 * @property {string} id        - stable, URL-safe id used in /live/:channelId
 * @property {string} name
 * @property {string} logo      - tvg-logo (may be empty)
 * @property {string} category  - group-title
 * @property {string} country   - ISO-2 country code derived from tvg-id (may be '')
 * @property {string} streamUrl - the .m3u8 stream URL
 * @property {string} tvgId     - the tvg-id attribute
 * @property {string} userAgent - optional http-user-agent required by the source
 */

/**
 * The tvg-id values follow `<name>.<cc>@<provider>` (e.g. "3ABNKids.us@SD"),
 * so we can derive the country code from between the last "." and the "@".
 * Falls back to '' when the format doesn't match.
 */
function countryFromTvgId(tvgId = '') {
  const at = tvgId.lastIndexOf('@');
  const dot = tvgId.lastIndexOf('.', at === -1 ? tvgId.length : at);
  if (dot === -1 || dot >= tvgId.length - 1) return '';
  const end = at === -1 ? tvgId.length : at;
  return tvgId.slice(dot + 1, end).toLowerCase();
}

/** Index of the first comma that is NOT inside a double-quoted value. */
function findUnquotedComma(str) {
  let inQuote = false;
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) return i;
  }
  return -1;
}

/** Parse a single `#EXTINF` line into its attributes + channel name. */
function parseExtinf(line) {
  const attrPart = line.slice(line.indexOf(':') + 1); // drop "#EXTINF:"
  const commaIdx = findUnquotedComma(attrPart);
  const attrs = commaIdx === -1 ? attrPart : attrPart.slice(0, commaIdx);
  const name = commaIdx === -1 ? '' : attrPart.slice(commaIdx + 1).trim();

  const read = (key) => {
    const re = new RegExp(`${key}="([^"]*)"`);
    const m = attrs.match(re);
    return m ? m[1] : '';
  };

  return {
    tvgId: read('tvg-id'),
    logo: read('tvg-logo'),
    groupTitle: read('group-title'),
    userAgent: read('http-user-agent'),
    name,
  };
}

/**
 * Fetch and parse the category playlist.
 * Never throws — returns [] on any upstream / parse failure so the UI can
 * render a friendly error state instead of crashing.
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<LiveChannel[]>}
 */
export async function fetchPlaylist(opts = {}) {
  if (playlistCache) return playlistCache;
  try {
    const res = await fetch(PLAYLIST_URL, { signal: opts.signal });
    if (!res.ok) return [];
    const text = await res.text();

    const channels = [];
    const seen = new Set();
    const extinfRe = /^#EXTINF:/;
    const skipRe = /^#/;
    const lines = text.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (!line || !extinfRe.test(line)) continue;

      const { tvgId, logo, groupTitle, userAgent, name } = parseExtinf(line);
      if (!name) continue;

      // The stream URL is the next non-# line (skips #EXTVLCOPT / #EXT...).
      let streamUrl = '';
      for (let j = i + 1; j < lines.length; j += 1) {
        const cand = lines[j].trim();
        if (!cand) continue;
        if (skipRe.test(cand)) continue;
        streamUrl = cand;
        break;
      }
      if (!streamUrl) continue;

      const country = countryFromTvgId(tvgId);
      // Prefer a stable id from tvg-id; fall back to a slug of the name + index.
      const baseId = tvgId && tvgId.trim() ? tvgId.trim() : `${name}-${i}`;
      let id = baseId;
      let n = 2;
      while (seen.has(id)) id = `${baseId}-${n++}`;
      seen.add(id);

      const category = groupTitle || 'General';
      // iptv-org can list the same stream twice with different tvg-ids; those
      // are distinct channels so only skip exact duplicates.
      const existing = channels.find(
        (c) =>
          c.name === name &&
          c.category === category &&
          c.tvgId === tvgId &&
          c.streamUrl === streamUrl,
      );
      if (existing) continue;

      channels.push({
        id,
        name,
        logo: logo || '',
        category,
        country,
        streamUrl,
        tvgId,
        userAgent: userAgent || '',
      });
    }

    playlistCache = channels;
    return channels;
  } catch {
    return [];
  }
}

/** Drop the in-memory playlist cache (e.g. for a manual "try again"). */
export function resetPlaylistCache() {
  playlistCache = null;
}

// Public IPTV sources are proxied through a serverless function (api/stream.mjs)
// to get past CORS and mixed-content restrictions and to forward any required
// User-Agent. This builds the player src for a channel.
const STREAM_PROXY = '/api/stream';

/**
 * @param {LiveChannel} channel
 * @returns {string} proxied URL the player should load.
 */
export function buildStreamUrl(channel) {
  const url = channel?.streamUrl || '';
  if (!url) return url;
  let out = `${STREAM_PROXY}?url=${encodeURIComponent(url)}`;
  if (channel?.userAgent) out += `&ua=${encodeURIComponent(channel.userAgent)}`;
  return out;
}

// --- EPG (XMLTV) -------------------------------------------------------------

/**
 * globetvapp/epg country folders (capitalized) keyed by ISO-2 country code.
 * EPG URL pattern: raw.githubusercontent.com/globetvapp/epg/main/{Folder}/{folder}1.xml
 * (e.g. United States -> Usa/usa1.xml).
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

/** Map ISO codes -> globetvapp folder name for quick lookups. */
const REGION_BY_CODE = EPG_REGIONS.reduce((acc, r) => {
  acc[r.code.toLowerCase()] = r;
  acc[r.code] = r;
  return acc;
}, {});

/** Fallback region used when a channel's country isn't in EPG_REGIONS. */
export const DEFAULT_EPG_REGION = 'US';

export function getRegionByCode(code) {
  return (
    REGION_BY_CODE[String(code || '').toUpperCase()] ??
    REGION_BY_CODE[DEFAULT_EPG_REGION]
  );
}

/**
 * Resolve an EPG region from a channel's ISO-2 country code (the code derived
 * from its tvg-id). This lets deep-linked channels auto-derive a matching EPG
 * stint instead of relying only on the user's selected region. UK channels use
 * the ".uk" suffix, which we alias to the "GB" region. Returns null when the
 * country isn't covered by EPG_REGIONS (e.g. "ww" worldwide feeds).
 * @param {string} country
 * @returns {{ code:string, label:string, folder:string }|null}
 */
export function getRegionForCountry(country) {
  const cc = String(country || '').toLowerCase();
  const alias = cc === 'uk' ? 'gb' : cc;
  return (
    EPG_REGIONS.find((r) => r.code.toLowerCase() === alias) ??
    null
  );
}

/** Build the globetvapp EPG XML URL for a region/folder. */
export function epgUrlFor(region) {
  const folder = region?.folder || getRegionByCode(DEFAULT_EPG_REGION).folder;
  return `https://raw.githubusercontent.com/globetvapp/epg/main/${folder}/${folder.toLowerCase()}1.xml`;
}
/**
 * Parse XMLTV time into a UTC ms timestamp. XMLTV timestamps look like
 * "20240921143000 +0000" (yyyymmddhhmmss + timezone offset).
 */
function parseXmltvTime(str, fallback = 0) {
  const m = String(str || '').match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-])(\d{2})(\d{2})?/,
  );
  if (!m) return fallback;
  const [, y, mo, d, h, mi, s, sign, oh, om] = m;
  const date = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
  );
  const offset = (Number(oh) * 60 + Number(om || 0)) * 60000;
  const utc = date.getTime() - (sign === '-' ? offset : -offset);
  return Number.isFinite(utc) ? utc : fallback;
}

function normalizeKey(name = '') {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Fetch + parse XMLTV for a region and return a map:
 *   tvgId -> programme[]
 * where each programme is { startMs, stopMs, title } sorted by startMs.
 * Never throws — returns {} on any failure.
 * @param {string} regionCode
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function fetchEPG(regionCode = DEFAULT_EPG_REGION, opts = {}) {
  const region = getRegionByCode(regionCode);
  try {
    const res = await fetch(epgUrlFor(region), { signal: opts.signal });
    if (!res.ok) return {};
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return {};

    const byChannel = new Map();
    const programmes = doc.getElementsByTagName('programme');
    for (const prog of programmes) {
      const channel = prog.getAttribute('channel') || '';
      if (!channel) continue;
      const start = parseXmltvTime(prog.getAttribute('start'));
      const stop = parseXmltvTime(prog.getAttribute('stop'), start + 3600000);
      const titleEl = prog.getElementsByTagName('title')[0];
      const title = titleEl?.textContent?.trim() || 'No program info';
      const list = byChannel.get(channel) || [];
      list.push({ startMs: start, stopMs: stop, title });
      byChannel.set(channel, list);
    }

    const map = {};
    byChannel.forEach((list, key) => {
      map[key] = list.sort((a, b) => a.startMs - b.startMs);
    });
    return map;
  } catch {
    return {};
  }
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