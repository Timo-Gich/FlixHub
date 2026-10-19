/**
 * GET /api/resolve?type=movie&id=<tmdbId>
 * GET /api/resolve?type=tv&id=<tmdbId>&season=<n>&episode=<n>
 * -> { streamUrl, userAgent, referer, origin, subtitles[], quality, qualities[] }
 * Env: RESOLVER_BASE_URL (VidLink-reverse on Railway), CONSUMET_BASE_URL (fallback).
 *
 * IMPORTANT: video bytes are proxied by RAILWAY (/proxy route on the same
 * host), NOT by Vercel /api/stream. bcdn nginx throttles Vercel's shared
 * egress IPs (429) but trusts Railway's IP. Vercel only resolves metadata.
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
        let out = null;
        try {
          out = normExtractor(await r.json().catch(() => null), RESOLVER_BASE);
        } catch (e) {
          if (e?.message === 'missing-resolver-base') {
            return res.status(501).json({ error: 'RESOLVER_BASE_URL is not set on this deployment.' });
          }
          throw e;
        }
        if (out) {
          // Signed bcdn URLs expire fast (stream TTL ~3600s, sign timestamps
          // drift). Keep edge cache tiny so we never serve a dead sign.
          res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
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

function normExtractor(d, resolverBase) {
  if (!d || typeof d !== 'object') return null;
  // Railway resolver shape: { headers, playlist: null|string, stream: {
  //   qualities: { 360: {type,url}, ... }, captions: [{language,url}] } }
  // VidLink returns progressive MP4s with requiresProxy: true. Video bytes
  // MUST go through Railway's /proxy (same trusted IP that fetched the
  // signed URLs) — Vercel egress is 429-throttled by bcdn nginx.
  const h = d.headers || d?.stream?.headers || {};
  const ua = h['user-agent'] || h['User-Agent'] || h['UserAgent'] || UA;
  const referer = h.referer || h.Referer || 'https://vidlink.pro/';
  const origin = h.origin || h.Origin || 'https://vidlink.pro';
  const subtitles = normSubs(d.subtitles || d.captions || d?.stream?.captions || []);
  const viaRailway = (rawUrl) => {
    if (!resolverBase) {
      // Misconfigured: without RESOLVER_BASE_URL we can't build the trusted
      // Railway proxy URL, so signal failure instead of leaking a raw bcdn
      // link that the browser will ORB-block.
      throw new Error('missing-resolver-base');
    }
    return `${resolverBase}/proxy?url=${encodeURIComponent(rawUrl)}&referer=${encodeURIComponent(referer)}`;
  };

  // 1) Explicit HLS playlist URL wins when present (via Railway proxy).
  const pl = d.playlist || d?.stream?.playlist || null;
  if (typeof pl === 'string' && pl) {
    const isText = pl.trimStart().startsWith('#EXTM3U');
    if (!isText) {
      const isHls = /\.m3u8($|\?)/i.test(pl);
      return {
        streamUrl: isHls ? viaRailway(pl) : pl, userAgent: ua, referer, origin, subtitles,
        proxy: isHls ? 'railway' : false,
      };
    }
    // Raw playlist text (no URL) — no direct src to return; fall through.
  }

  // 2) Quality map: prefer any .m3u8 rendition, else LOWEST numeric MP4
  // (smaller initial Range = less throttle surface; player buffers up).
  const qualities = d?.stream?.qualities || d?.qualities || null;
  if (qualities && typeof qualities === 'object') {
    const entries = Object.entries(qualities)
      .filter(([, q]) => q && typeof q.url === 'string' && q.url)
      .map(([label, q]) => ({ label, url: q.url, type: (q.type || '').toLowerCase() }));
    const m3u8 = entries.find((e) => /\.m3u8($|\?)/i.test(e.url) || e.type === 'm3u8' || e.type === 'hls');
    if (m3u8) {
      return { streamUrl: viaRailway(m3u8.url), userAgent: ua, referer, origin, subtitles, proxy: 'railway', quality: m3u8.label };
    }
    entries.sort((a, b) => (parseInt(a.label, 10) || 0) - (parseInt(b.label, 10) || 0));
    if (entries[0]) {
      return {
        streamUrl: viaRailway(entries[0].url), userAgent: ua, referer, origin, subtitles,
        proxy: 'railway', quality: entries[0].label,
        qualities: entries.map((e) => ({ ...e, url: viaRailway(e.url) })),
      };
    }
  }

  // 3) Generic fallbacks (other extractor shapes).
  const url = d.streamUrl || d.url || d?.stream?.url || d?.sources?.[0]?.url || null;
  if (!url || typeof url !== 'string') return null;
  const isHls = /\.m3u8($|\?)/i.test(url);
  return {
    streamUrl: isHls ? viaRailway(url) : url, userAgent: ua, referer, origin, subtitles,
    proxy: isHls ? 'railway' : false,
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
