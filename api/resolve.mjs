/**
 * GET /api/resolve?type=movie&id=<tmdbId>
 * GET /api/resolve?type=tv&id=<tmdbId>&season=<n>&episode=<n>
 * -> { streamUrl, userAgent, referer, origin, subtitles[] }
 * Env: RESOLVER_BASE_URL (VidLink-reverse), CONSUMET_BASE_URL (fallback).
 * Play the result via /api/stream (forwards headers + rewrites manifest).
 */
const RESOLVER_BASE = (process.env.RESOLVER_BASE_URL || '').replace(/\/$/, '');
const CONSUMET_BASE = (process.env.CONSUMET_BASE_URL || 'https://api.consumet.org').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' });
  const u = new URL(req.url ?? '', `https://${req.headers.host || 'localhost'}`);
  const type = (u.searchParams.get('type') || '').toLowerCase();
  const id = (u.searchParams.get('id') || '').trim();
  const season = (u.searchParams.get('season') || '').trim();
  const episode = (u.searchParams.get('episode') || '').trim();
  if ((type !== 'movie' && type !== 'tv') || !id) {
    return res.status(400).json({ error: 'use ?type=movie|tv&id=<tmdbId>' });
  }
  if (type === 'tv' && (!season || !episode)) {
    return res.status(400).json({ error: 'tv requires season and episode' });
  }
  if (RESOLVER_BASE) {
    try {
      const path = type === 'movie'
        ? `${RESOLVER_BASE}/movie/${encodeURIComponent(id)}`
        : `${RESOLVER_BASE}/tv/${encodeURIComponent(id)}/${season}/${episode}`;
      const r = await fetch(path, { headers: { Accept: 'application/json', 'User-Agent': UA } });
      if (r.ok) {
        const out = normExtractor(await r.json().catch(() => null));
        if (out) {
          res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
          return res.status(200).json(out);
        }
      }
    } catch { /* fallback below */ }
  }
  try {
    const infoUrl = type === 'movie'
      ? `${CONSUMET_BASE}/movies/flixhq/info/${encodeURIComponent(id)}?type=movie`
      : `${CONSUMET_BASE}/movies/flixhq/info/${encodeURIComponent(id)}?type=tv`;
    const ir = await fetch(infoUrl, { headers: { 'User-Agent': UA } });
    if (ir.ok) {
      const info = await ir.json().catch(() => null);
      const epId = pickEp(info, season, episode);
      if (epId) {
        const wr = await fetch(
          `${CONSUMET_BASE}/movies/flixhq/watch?episodeId=${encodeURIComponent(epId)}&mediaId=${encodeURIComponent(info?.id || id)}`,
          { headers: { 'User-Agent': UA } },
        );
        if (wr.ok) {
          const out = normConsumet(await wr.json().catch(() => null));
          if (out) {
            res.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=86400');
            return res.status(200).json(out);
          }
        }
      }
    }
  } catch { /* -> 404/502 */ }
  if (RESOLVER_BASE) return res.status(502).json({ error: 'upstream resolver error' });
  // No resolver wired: explicit 501 so the client shows a clean
  // "not configured" message instead of a JSON parse error.
  return res.status(501).json({ error: 'Direct HLS is not configured yet. Set RESOLVER_BASE_URL to enable it.' });
}

function normExtractor(d) {
  if (!d || typeof d !== 'object') return null;
  const url = d.streamUrl || d.url || d.playlist || d?.sources?.[0]?.url || null;
  if (!url) return null;
  const h = d.headers || {};
  return {
    streamUrl: url, userAgent: h['user-agent'] || h['User-Agent'] || UA,
    referer: h.referer || h.Referer || 'https://vidlink.pro/',
    origin: h.origin || h.Origin || 'https://vidlink.pro',
    subtitles: normSubs(d.subtitles || d.captions || []),
  };
}

function normConsumet(w) {
  if (!w || typeof w !== 'object') return null;
  const src = Array.isArray(w.sources) ? [...w.sources].reverse() : [];
  const hls = src.find((s) => /\.m3u8($|\?)/i.test(s?.url || '')) || src[0];
  if (!hls?.url) return null;
  const h = w.headers || {};
  return {
    streamUrl: hls.url, userAgent: h['User-Agent'] || UA,
    referer: h.Referer || h.referer || '', origin: h.Origin || h.origin || '',
    subtitles: normSubs(w.subtitles || []),
  };
}

function normSubs(l) {
  if (!Array.isArray(l)) return [];
  return l.map((s) => ({ lang: s?.lang || s?.label || 'Subtitles', url: s?.url || s?.file || '' })).filter((s) => s.url);
}

function pickEp(info, season, episode) {
  if (!info || typeof info !== 'object') return null;
  const eps = Array.isArray(info.episodes) ? info.episodes : [];
  if (!eps.length) return info.episodeId || info.id || null;
  const m = eps.find((x) => Number(x?.season) === Number(season) && Number(x?.number ?? x?.episode) === Number(episode)) || eps[0];
  return m?.id || m?.episodeId || null;
}
