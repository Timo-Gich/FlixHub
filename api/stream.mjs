import { Readable } from 'node:stream';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Accept-Ranges', 'bytes');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const parsed = new URL(req.url ?? '', 'https://localhost');
  const target = parsed.searchParams.get('url') || '';
  const ua = parsed.searchParams.get('ua') || '';
  const referer = parsed.searchParams.get('referer') || '';
  const origin = parsed.searchParams.get('origin') || '';
  if (!target) return res.status(400).send('missing url');
  try {
    const headers = {
      'User-Agent': ua || 'Mozilla/5.0 Chrome/124.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    if (referer) headers.Referer = referer;
    if (origin) headers.Origin = origin;
    // Browser-like fingerprint: bcdn nginx throttles bare-bones clients.
    if (referer) {
      try { headers['Sec-Fetch-Site'] = new URL(referer).origin === new URL(target).origin ? 'same-origin' : 'cross-site'; } catch { headers['Sec-Fetch-Site'] = 'cross-site'; }
      headers['Sec-Fetch-Mode'] = 'no-cors';
      headers['Sec-Fetch-Dest'] = 'video';
    }
    const range = req.headers && req.headers.range;
    if (range) headers.Range = range;
    const upstream = await fetch(target, {
      headers, redirect: 'follow', method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    });
    // Upstream throttled (bcdn nginx 429): forward Retry-After + JSON instead
    // of piping their HTML error page into the video element.
    if (upstream.status === 429) {
      const retryAfter = upstream.headers.get('retry-after');
      if (retryAfter) res.setHeader('Retry-After', retryAfter);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      const body = JSON.stringify({ error: 'cdn throttled', retryAfter: retryAfter ? Number(retryAfter) || retryAfter : null });
      res.status(429);
      return res.send(body);
    }
    const ct = upstream.headers.get('content-type') || '';
    if (req.method !== 'HEAD' && /\.m3u8($|\?)/i.test(target)) {
      const text = await upstream.text();
      if (text.trimStart().startsWith('#EXTM3U')) {
        const out = rewrite(text, target, { ua, referer, origin });
        res.setHeader('Content-Type', ct || 'application/vnd.apple.mpegurl');
        return res.status(upstream.status).send(out);
      }
    }
    res.setHeader('Content-Type', ct || guess(target));
    res.setHeader('Accept-Ranges', 'bytes');
    const fwd = ['content-range', 'content-length', 'etag', 'last-modified'];
    for (const h of fwd) {
      const v = upstream.headers.get(h);
      if (v != null) res.setHeader(h, v);
    }
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length');
    // Cache successful Range chunks at the edge: repeat seeks for the same
    // bytes don't hit bcdn again (reduces throttle pressure).
    if (upstream.status === 206) {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
    }
    res.status(upstream.status || 200);
    if (!upstream.body) return res.end();
    const nodeStream = Readable.fromWeb(upstream.body);
    await new Promise((resolve) => {
      nodeStream.on('error', () => { try { res.end(); } catch {} resolve(); });
      res.on('close', () => { try { nodeStream.destroy(); } catch {} resolve(); });
      res.on('finish', resolve);
      nodeStream.pipe(res);
    });
  } catch {
    if (!res.headersSent) return res.status(502).send('upstream error');
    try { res.end(); } catch {}
  }
}

function guess(t) {
  if (/\.m3u8($|\?)/i.test(t || '')) return 'application/vnd.apple.mpegurl';
  if (/\.mp4($|\?)/i.test(t || '')) return 'video/mp4';
  return 'application/octet-stream';
}

function rewrite(text, baseUrl, extra) {
  const p = '/api/stream';
  let q = '';
  if (extra.ua) q += '&ua=' + encodeURIComponent(extra.ua);
  if (extra.referer) q += '&referer=' + encodeURIComponent(extra.referer);
  if (extra.origin) q += '&origin=' + encodeURIComponent(extra.origin);
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return line;
    try {
      return p + '?url=' + encodeURIComponent(new URL(t, baseUrl).toString()) + q;
    } catch { return line; }
  }).join('\n');
}
