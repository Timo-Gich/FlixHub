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
        : `${RESOLVER_BASE}/series/${encodeURIComponent(id)}/${season}/${episode}`;
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
  // Railway resolver shape: { headers, playlist: null|string, stream: {
  //   qualities: { 360: {type,url}, ... }, captions: [{language,url}] } }
  // VidLink currently returns progressive MP4s (not .m3u8) with
  // flags: ["cors-allowed"], so they play direct without /api/stream.
  const h = d.headers || d?.stream?.headers || {};
  const ua = h['user-agent'] || h['User-Agent'] || h['UserAgent'] || UA;
  const referer = h.referer || h.Referer || 'https://vidlink.pro/';
  const origin = h.origin || h.Origin || 'https://vidlink.pro';
  const subtitles = normSubs(d.subtitles || d.captions || d?.stream?.captions || []);

  // 1) Explicit HLS playlist text/URL wins when present.
  const pl = d.playlist || d?.stream?.playlist || null;
  if (typeof pl === 'string' && pl) {
    const isText = pl.trimStart().startsWith('#EXTM3U');
    if (!isText) {
      return {
        streamUrl: pl, userAgent: ua, referer, origin, subtitles,
        proxy: /\.m3u8($|\?)/i.test(pl),
      };
    }
    // Raw playlist text (no URL) — no direct src to return; fall through.
  }

  // 2) Quality map: prefer any .m3u8 rendition, else highest numeric MP4.
  const qualities = d?.stream?.qualities || d?.qualities || null;
  if (qualities && typeof qualities === 'object') {
    const entries = Object.entries(qualities)
      .filter(([, q]) => q && typeof q.url === 'string' && q.url)
      .map(([label, q]) => ({ label, url: q.url, type: (q.type || '').toLowerCase() }));
    const m3u8 = entries.find((e) => /\.m3u8($|\?)/i.test(e.url) || e.type === 'm3u8' || e.type === 'hls');
    if (m3u8) {
      return { streamUrl: m3u8.url, userAgent: ua, referer, origin, subtitles, proxy: true, quality: m3u8.label };
    }
    entries.sort((a, b) => (parseInt(b.label, 10) || 0) - (parseInt(a.label, 10) || 0));
    if (entries[0]) {
      const corsOk = Array.isArray(d?.stream?.flags) && d.stream.flags.includes('cors-allowed');
      return {
        streamUrl: entries[0].url, userAgent: ua, referer, origin, subtitles,
        proxy: corsOk ? false : true, quality: entries[0].label,
        qualities: entries,
      };
    }
  }

  // 3) Generic fallbacks (other extractor shapes).
  const url = d.streamUrl || d.url || d?.stream?.url || d?.sources?.[0]?.url || null;
  if (!url || typeof url !== 'string') return null;
  return {
    streamUrl: url, userAgent: ua, referer, origin, subtitles,
    proxy: /\.m3u8($|\?)/i.test(url),
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
  return l
    .map((s) => ({
      lang: s?.lang || s?.label || s?.language || s?.name || 'Subtitles',
      url: s?.url || s?.file || '',
      type: s?.type || '',
    }))
    .filter((s) => s.url);
}

function pickEp(info, season, episode) {
  if (!info || typeof info !== 'object') return null;
  const eps = Array.isArray(info.episodes) ? info.episodes : [];
  if (!eps.length) return info.episodeId || info.id || null;
  const m = eps.find((x) => Number(x?.season) === Number(season) && Number(x?.number ?? x?.episode) === Number(episode)) || eps[0];
  return m?.id || m?.episodeId || null;
}
