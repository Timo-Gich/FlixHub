/**
 * Vercel serverless function: IMDb suggestion API proxy.
 *
 * Proxies IMDb's public (key-less) suggestion endpoint and returns a small,
 * normalized result list. Cached by Vercel's edge for 1 hour (stale 24h).
 *
 * GET /api/imdb-search?q=<term>
 * Response: array of
 *   { imdbId, title, year, poster, type: 'movie' | 'tv' }
 *
 * Never throws / returns a 500 — any upstream failure yields an empty array.
 */
export default async function handler(req, res) {
  const cacheHeader = 's-maxage=3600, stale-while-revalidate=86400';

  const url = new URL(req.url ?? '', 'http://localhost');
  const query = (url.searchParams.get('q') || '').trim();
  const results = [];

  if (query) {
    try {
      const endpoint = `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(query)}.json`;
      const upstream = await fetch(endpoint);
      if (upstream.ok) {
        const json = await upstream.json();
        const d = Array.isArray(json?.d) ? json.d : [];
        for (const item of d) {
          const qid = item?.qid;
          if (qid !== 'movie' && qid !== 'tvSeries') continue;
          const type = qid === 'tvSeries' ? 'tv' : 'movie';
          let imdbId = String(item?.id || '');
          if (imdbId && !imdbId.startsWith('tt')) imdbId = `tt${imdbId}`;
          const year = Number(item?.y);
          results.push({
            imdbId,
            title: item?.l || 'Untitled',
            year: Number.isFinite(year) && year > 0 ? year : null,
            poster: item?.i?.imageUrl || null,
            type,
          });
        }
      }
    } catch {
      // Swallow upstream errors; return partially gathered results / empty.
    }
  }

  res.setHeader('Cache-Control', cacheHeader);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).json(results);
}