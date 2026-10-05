/**
 * Vercel serverless function: generic CORS proxy fallback for HLS live streams.
 *
 * Free IPTV streams frequently refuse browser playback because their CDNs don't
 * send permissive CORS headers (a classic CORS error) or serve plain http://
 * (mixed content on an https page). Fetching server-to-server bypasses both.
 * The live player uses this as an automatic fallback when loading a stream
 * directly (channel.streamUrl) fails within a few seconds.
 *
 * GET /api/proxy?url=<absolute>&ua=<optional user-agent>
 *   - url: absolute URL of an .m3u8 manifest (or a segment / child playlist),
 *          rewritten back through /api/proxy when the payload is a playlist.
 *   - ua : optional User-Agent the source requires (ignored by most).
 *
 * Note: Vercel serverless caps each response body (~4.5 MB) and execution time
 * (~10 s) - comfortably enough for live TV manifests and media segments.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const parsed = new URL(req.url ?? '', `https://${req.headers.host || 'localhost'}`);
  const target = parsed.searchParams.get('url') || '';
  const ua = parsed.searchParams.get('ua') || '';
  if (!target) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(400).send('missing url');
  }
  try {
    const headers = {
      'User-Agent':
        ua ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    const upstream = await fetch(target, { headers, redirect: 'follow' });
    const contentType = upstream.headers.get('content-type') || '';
    const buffer = Buffer.from(await upstream.arrayBuffer());
    // Manifest? Rewrite child / segment URLs back through this proxy so every
    // subsequent request the player makes is equally CORS-safe.
    if (isManifest(target, contentType, buffer)) {
      const rewritten = rewriteManifest(buffer.toString('utf8'), target, ua);
      res.setHeader('Content-Type', contentType || 'application/vnd.apple.mpegurl');
      return res.status(upstream.status).send(rewritten);
    }
    res.setHeader('Content-Type', contentType || 'application/octet-stream');
    return res.status(upstream.status).send(buffer);
  } catch {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(502).send('upstream error');
  }
}
function isManifest(url, contentType, buffer) {
  if (/\.m3u8($|\?)/i.test(url)) return true;
  if (/mpegurl|mpegURL|vnd.apple.mpegurl/i.test(contentType || '')) return true;
  if (buffer.length > 4) {
    const head = buffer.subarray(0, buffer.length < 64 ? buffer.length : 64).toString('utf8');
    if (head.startsWith('#EXTM3U')) return true;
  }
  return false;
}
function rewriteManifest(text, baseUrl, ua) {
  const prefix = '/api/proxy';
  const uaParam = ua ? `&ua=${encodeURIComponent(ua)}` : '';
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Tags and comments pass through untouched; bare URL lines get proxied.
    if (trimmed === '' || trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }
    try {
      const absolute = new URL(trimmed, baseUrl).toString();
      out.push(`${prefix}?url=${encodeURIComponent(absolute)}${uaParam}`);
    } catch {
      out.push(line);
    }
  }
  return out.join('\n');
}
