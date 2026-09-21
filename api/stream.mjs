/**
 * Vercel serverless function: HLS stream proxy.
 *
 * Public IPTV streams are usually not directly playable from a browser because
 * (a) their CDNs don't send CORS headers our origin accepts, (b) ~18% are plain
 * http:// (mixed-content on an https site), and (c) many require a custom
 * User-Agent. Doing the video request server-to-server sidesteps all of that.
 *
 * While proxying an .m3u8 manifest we also rewrite its relative segment / child
 * playlist URLs to point back through this same endpoint, so every subsequent
 * request the player makes is equally proxied and CORS-safe.
 *
 * GET /api/stream?url=<stream>&ua=<optional user-agent>
 *   - url: absolute URL of an .m3u8 manifest or one of its segments
 *   - ua  : optional User-Agent the source requires
 *
 * Note: Vercel serverless caps each response body (~4.5 MB) and execution time
 * (~10 s). HLS manifests and media segments fit comfortably under both.
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
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
        ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
    };
    const upstream = await fetch(target, { headers, redirect: 'follow' });

    const contentType = upstream.headers.get('content-type') || '';
    const buffer = Buffer.from(await upstream.arrayBuffer());

    // Manifest? Rewrite child URLs through the proxy.
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

/** True when the payload looks like an HLS playlist (.m3u8). */
function isManifest(url, contentType, buffer) {
  if (/\.m3u8($|\?)/i.test(url)) return true;
  if (/mpegurl|mpegURL|vnd.apple.mpegurl/i.test(contentType || '')) return true;
  if (buffer.length > 4) {
    const head = buffer.subarray(0, buffer.length < 64 ? buffer.length : 64).toString('utf8');
    if (head.startsWith('#EXTM3U')) return true;
  }
  return false;
}

/** Rewrite bare URL lines in an .m3u8 to absolute URLs through /api/stream. */
function rewriteManifest(text, baseUrl, ua) {
  const prefix = '/api/stream';
  const uaParam = ua ? `&ua=${encodeURIComponent(ua)}` : '';
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Tags (#EXTINF, #EXT-X-...), blank lines and comments pass through untouched.
    if (trimmed === '' || trimmed.startsWith('#')) {
      out.push(line);
      continue;
    }
    try {
      const absolute = new URL(trimmed, baseUrl).toString();
      out.push(`${prefix}?url=${encodeURIComponent(absolute)}${uaParam}`);
    } catch {
      out.push(line); // leave un-parseable lines as-is
    }
  }
  return out.join('\n');
}