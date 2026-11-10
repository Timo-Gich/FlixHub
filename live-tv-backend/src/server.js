import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import {
  EPG_BASE_URL,
  EPG_FALLBACK_URL,
  PLAYLIST_URL,
  indexXmltv,
  matchXmltv,
  parsePlaylist,
} from './parsers.js';

const PORT = Number(process.env.PORT) || 3001;
const PLAYLIST_TTL_MS = 15 * 60 * 1000;
const EPG_TTL_MS = 3 * 60 * 60 * 1000;
const EPG_WINDOW_BEHIND_MS = 4 * 60 * 60 * 1000;
const EPG_WINDOW_AHEAD_MS = 24 * 60 * 60 * 1000;
const MAX_PLAYLIST_BYTES = 80 * 1024 * 1024;
const STREAM_SECRET = process.env.STREAM_SIGNING_SECRET || crypto.randomBytes(32).toString('hex');
const dnsCache = new Map();
const FRONTEND_ORIGINS = (process.env.FRONTEND_ORIGINS || '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

let playlistCache = null;
let playlistPending = null;
const epgCache = new Map();

const app = express();
app.set('trust proxy', 1);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (FRONTEND_ORIGINS.includes('*') || (origin && FRONTEND_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGINS.includes('*') ? '*' : origin);
  }
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use(express.json({ limit: '256kb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

async function getPlaylist() {
  if (playlistCache && Date.now() - playlistCache.fetchedAt < PLAYLIST_TTL_MS) {
    return playlistCache.channels;
  }
  if (playlistPending) return playlistPending;

  playlistPending = (async () => {
    try {
      const response = await fetch(PLAYLIST_URL, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Playlist upstream returned ${response.status}`);
      const text = await readTextLimited(response, MAX_PLAYLIST_BYTES);
      const channels = parsePlaylist(text);
      if (!channels.length) throw new Error('Playlist response contained no channels');
      playlistCache = { channels, fetchedAt: Date.now() };
      return channels;
    } catch (error) {
      if (playlistCache) {
        console.warn('[live-tv] serving stale playlist after refresh failure:', error.message);
        return playlistCache.channels;
      }
      throw error;
    } finally {
      playlistPending = null;
    }
  })();
  return playlistPending;
}

app.get('/api/channels', async (_req, res) => {
  try {
    const channels = await getPlaylist();
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json({
      channels: channels.map(({ id, name, logo, category, country, tvgId }) => ({
        id,
        name,
        logo,
        category,
        country,
        tvgId,
        streamUrl: `/api/streams/${encodeURIComponent(id)}`,
      })),
    });
  } catch (error) {
    console.error('[live-tv] playlist request failed:', error);
    res.status(502).json({ error: 'Live channel playlist is temporarily unavailable' });
  }
});

async function getRemoteEpg(code) {
  const now = Date.now();
  const cached = epgCache.get(code);
  if (cached && cached.expiresAt > now && cached.fromMs <= now - EPG_WINDOW_BEHIND_MS &&
      cached.toMs >= now + EPG_WINDOW_AHEAD_MS) return cached;
  if (cached?.pending) return cached.pending;

  const fromMs = now - EPG_WINDOW_BEHIND_MS;
  const toMs = now + EPG_WINDOW_AHEAD_MS;
  const entry = cached || {};
  entry.pending = (async () => {
    try {
      const url = `${EPG_BASE_URL}/epg_${code}.xml`;
      let response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) {
        await response.body?.cancel();
        response = await fetch(EPG_FALLBACK_URL, { signal: AbortSignal.timeout(60000) });
      }
      if (!response.ok) throw new Error(`XMLTV upstream returned ${response.status}`);
      const xml = await readTextLimited(response, 100 * 1024 * 1024);
      const index = indexXmltv(xml, fromMs, toMs);
      Object.assign(entry, { index, fromMs, toMs, expiresAt: Date.now() + EPG_TTL_MS });
      return entry;
    } catch (error) {
      if (entry.index) {
        console.warn(`[live-tv] serving stale ${code} EPG after refresh failure:`, error.message);
        return entry;
      }
      throw error;
    } finally {
      delete entry.pending;
    }
  })();
  epgCache.set(code, entry);
  return entry.pending;
}

app.post('/api/epg', async (req, res) => {
  const code = String(req.body?.country || '').toUpperCase();
  const channels = req.body?.channels;
  const fromMs = Number(req.body?.from);
  const toMs = Number(req.body?.to);
  if (!/^[A-Z]{2}$/.test(code)) return res.status(400).json({ error: 'country must be an ISO-2 code' });
  if (!Array.isArray(channels) || channels.length < 1 || channels.length > 500) {
    return res.status(400).json({ error: 'channels must contain 1 to 500 channel entries' });
  }
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs ||
      toMs - fromMs > 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: 'EPG time range must be at most 24 hours' });
  }
  const requested = channels.filter((channel) =>
    channel && typeof channel.tvgId === 'string' && channel.tvgId.length <= 256 &&
    typeof channel.name === 'string' && channel.name.length <= 256,
  );
  if (requested.length !== channels.length) return res.status(400).json({ error: 'invalid channel entries' });

  try {
    const guide = await getRemoteEpg(code);
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=1800');
    res.json({ country: code, programmes: matchXmltv(guide.index, requested, fromMs, toMs) });
  } catch (error) {
    console.error(`[live-tv] ${code} EPG request failed:`, error);
    res.status(502).json({ error: 'Programme guide is temporarily unavailable' });
  }
});

function isPrivateAddress(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 2 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0 && octets[2] === 113);
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::' || normalized === '::1' ||
      normalized.startsWith('fc') || normalized.startsWith('fd') ||
      normalized.startsWith('fe8') || normalized.startsWith('fe9') ||
      normalized.startsWith('fea') || normalized.startsWith('feb') ||
      normalized.startsWith('ff') || normalized.startsWith('::ffff:');
  }
  return true;
}

async function assertPublicUrl(value) {
  const target = new URL(value);
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) {
    throw new Error('Unsupported stream URL');
  }
  const hostname = target.hostname.toLowerCase().replace(/\.$/, '');
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')) throw new Error('Private stream host is not allowed');
  if (!dnsCache.has(hostname) || dnsCache.get(hostname).expiresAt < Date.now()) {
    const addresses = net.isIP(hostname)
      ? [{ address: hostname }]
      : await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error('Private stream host is not allowed');
    }
    dnsCache.set(hostname, { expiresAt: Date.now() + 10 * 60 * 1000 });
  }
  return target;
}

function streamSignature(url, userAgent, expires) {
  return crypto.createHmac('sha256', STREAM_SECRET)
    .update(`${url}\n${userAgent}\n${expires}`)
    .digest('hex');
}

function signedResourceUrl(url, userAgent, apiOrigin) {
  const expires = String(Date.now() + 20 * 60 * 1000);
  const signature = streamSignature(url, userAgent, expires);
  const resource = new URL('/api/stream-resource', apiOrigin);
  resource.searchParams.set('url', url);
  resource.searchParams.set('ua', userAgent);
  resource.searchParams.set('exp', expires);
  resource.searchParams.set('sig', signature);
  return resource.toString();
}

function validSignature(url, userAgent, expires, signature) {
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now() ||
      Number(expires) > Date.now() + 21 * 60 * 1000 || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(streamSignature(url, userAgent, expires), 'hex');
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

async function fetchRemote(url, userAgent, headers = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let current = url;
    try {
      for (let redirects = 0; redirects <= 4; redirects += 1) {
        await assertPublicUrl(current);
        const response = await fetch(current, {
          headers: {
            'User-Agent': userAgent || 'Mozilla/5.0 Chrome/124.0 Safari/537.36',
            Accept: '*/*',
            'Accept-Encoding': 'identity',
            ...headers,
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(30000),
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location || redirects === 4) throw new Error('Too many or invalid stream redirects');
          current = new URL(location, current).toString();
          continue;
        }
        if (attempt === 0 && [502, 503, 504].includes(response.status)) {
          await response.body?.cancel();
          await new Promise((resolve) => setTimeout(resolve, 250));
          break;
        }
        return { response, url: current };
      }
    } catch (error) {
      if (attempt === 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('Too many stream redirects');
}

function isManifest(url, contentType, text = '') {
  return /\.m3u8($|\?)/i.test(url) ||
    /mpegurl|vnd\.apple\.mpegurl/i.test(contentType || '') ||
    text.trimStart().startsWith('#EXTM3U');
}

function rewriteManifest(text, baseUrl, userAgent, apiOrigin) {
  const rewriteUrl = (value) => {
    try {
      const absolute = new URL(value, baseUrl);
      if (!['http:', 'https:'].includes(absolute.protocol)) return value;
      return signedResourceUrl(absolute.toString(), userAgent, apiOrigin);
    } catch {
      return value;
    }
  };
  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) {
      return line.replace(/URI="([^"]+)"/g, (_match, url) => `URI="${rewriteUrl(url)}"`);
    }
    return rewriteUrl(trimmed);
  }).join('\n');
}

function setStreamHeaders(res, response, url) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Accept-Ranges', 'bytes');
  const contentType = response.headers.get('content-type');
  res.setHeader('Content-Type', contentType || (/\.m3u8($|\?)/i.test(url)
    ? 'application/vnd.apple.mpegurl'
    : 'application/octet-stream'));
  for (const name of ['content-range', 'content-length', 'etag', 'last-modified', 'retry-after']) {
    const value = response.headers.get(name);
    if (value) res.setHeader(name, value);
  }
}

async function readTextLimited(response, maxBytes) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('Upstream response exceeded size limit');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total).toString('utf8');
}

async function serveStream(req, res, url, userAgent) {
  const headers = {};
  if (req.headers.range) headers.Range = req.headers.range;
  const { response, url: finalUrl } = await fetchRemote(url, userAgent, headers);
  const contentType = response.headers.get('content-type') || '';
  if (response.ok && !req.method.match(/HEAD/i) && isManifest(finalUrl, contentType)) {
    const text = await readTextLimited(response, 4 * 1024 * 1024);
    const origin = `${req.protocol}://${req.get('host')}`;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', contentType || 'application/vnd.apple.mpegurl');
    return res.status(response.status).send(rewriteManifest(text, finalUrl, userAgent, origin));
  }

  setStreamHeaders(res, response, finalUrl);
  res.status(response.status);
  if (req.method === 'HEAD' || !response.body) {
    await response.body?.cancel();
    return res.end();
  }
  res.on('close', () => {
    if (!res.writableEnded) response.body?.cancel().catch(() => {});
  });
  await pipeline(Readable.fromWeb(response.body), res);
}

app.all('/api/streams/:channelId', async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
  try {
    const id = req.params.channelId;
    const channel = (await getPlaylist()).find((item) => item.id === id);
    if (!channel) return res.status(404).send('channel not found');
    await serveStream(req, res, channel.streamUrl, channel.userAgent);
  } catch (error) {
    console.error('[live-tv] channel stream request failed:', error.message);
    if (!res.headersSent) res.status(502).send('stream temporarily unavailable');
    else res.destroy(error);
  }
});

app.all('/api/stream-resource', async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end();
  const { url, ua = '', exp = '', sig = '' } = req.query;
  if (typeof url !== 'string' || typeof ua !== 'string' || typeof exp !== 'string' ||
      typeof sig !== 'string' || !validSignature(url, ua, exp, sig)) {
    return res.status(403).send('invalid stream token');
  }
  try {
    await serveStream(req, res, url, ua);
  } catch (error) {
    console.error('[live-tv] stream resource request failed:', error.message);
    if (!res.headersSent) res.status(502).send('stream temporarily unavailable');
    else res.destroy(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error('[live-tv] request failed:', error);
  if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
});

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  app.listen(PORT, () => console.log(`[live-tv] backend listening on ${PORT}`));
}

export { app };
