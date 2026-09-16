// ----------------------------------------------------------------------------
// Unified search: TMDb first, IMDb fallback.
//
// Always tries TMDb (via searchAll). If TMDb returns zero results — or errors
// (network/rate-limit) — it falls back to the IMDb search proxy. Every result
// is tagged with source: 'tmdb' | 'imdb' so the UI can render IMDb-only
// results with limited metadata and route them to /imdb/:imdbId.
// ----------------------------------------------------------------------------

import { searchAll } from './tmdbService';
import { imdbSearch } from './imdbService';

/**
 * Search movies & TV across TMDb, transparently falling back to IMDb.
 * @returns {Promise<{ page, results, total_pages, total_results, fallback }>}
 */
export async function searchAllWithImdb(query, { page = 1 } = {}) {
  let tmdb = [];
  let tmdbSucceeded = false;

  try {
    const res = await searchAll(query, { page });
    tmdbSucceeded = true;
    tmdb = (res.results ?? []).map((r) => ({ ...r, source: 'tmdb' }));
  } catch {
    // TMDb error (rate limit, network, etc.) — fall through to IMDb.
    tmdb = [];
    tmdbSucceeded = false;
  }

  // Fall back to IMDb only when TMDb returned nothing (not on results).
  if (!tmdbSucceeded || tmdb.length === 0) {
    const imdb = await imdbSearch(query);
    return {
      page,
      results: imdb,
      total_pages: 1,
      total_results: imdb.length,
      fallback: true,
    };
  }

  return {
    page,
    results: tmdb,
    total_pages: 1,
    total_results: tmdb.length,
    fallback: false,
  };
}