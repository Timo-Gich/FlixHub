// ----------------------------------------------------------------------------
// The Movie Database (TMDb) v3 API service layer.
//
// All functions return Promises and throw structured errors so the UI can
// render loading / error states gracefully. The API key is read from the
// environment (Vite exposes only `VITE_*` vars to the client):
//
//   import.meta.env.VITE_TMDB_API_KEY
//
// Set it in your `.env` file (copy `.env.example` ➜ `.env`). A missing key
// throws a clear, actionable error instead of failing silently.
// ----------------------------------------------------------------------------

const API_KEY = import.meta.env.VITE_TMDB_API_KEY;
const API_BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

// A short timeout so a hanging request surfaces an error rather than an
// infinite spinner.
const REQUEST_TIMEOUT_MS = 15000;

export class TMDBError extends Error {
  constructor(message, { status, statusText, endpoint } = {}) {
    super(message);
    this.name = 'TMDBError';
    this.status = status;
    this.statusText = statusText;
    this.endpoint = endpoint;
  }
}

/**
 * Core request helper. Builds the URL, injects the API key, enforces the
 * timeout and normalises error cases.
 *
 * @param {string} endpoint  e.g. "/trending/movie/day"
 * @param {object} [params]  query params merged with the API key
 * @returns {Promise<any>}   parsed JSON body
 */
async function fetchFromTMDB(endpoint, params = {}) {
  if (!API_KEY) {
    throw new TMDBError(
      'TMDb API key is missing. Copy .env.example to .env and set VITE_TMDB_API_KEY, then restart the dev server.',
      { endpoint },
    );
  }

  const query = new URLSearchParams({ api_key: API_KEY, ...params });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}?${query.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      // TMDb returns a JSON body like { status_message, status_code } on errors.
      let detail = null;
      try {
        const body = await response.json();
        detail = body.status_message || body.status || response.statusText;
      } catch {
        detail = response.statusText;
      }
      throw new TMDBError(
        `TMDb request failed (${response.status}): ${detail || 'unknown error'}`,
        { status: response.status, statusText: detail, endpoint },
      );
    }

    return await response.json();
  } catch (err) {
    if (err?.name === 'AbortError') {
      throw new TMDBError(`TMDb request timed out after ${REQUEST_TIMEOUT_MS}ms`, { endpoint });
    }
    if (err instanceof TMDBError) throw err;
    // Network failures (DNS, offline, CORS, etc.) surface here.
    throw new TMDBError(`Unable to reach TMDb: ${err?.message ?? 'network error'}`, { endpoint });
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Endpoints --------------------------------------------------------------

/**
 * Movies trending today.
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @returns {Promise<{ page:number, results:Array, total_pages:number }>}
 */
export function fetchTrendingMovies({ page = 1 } = {}) {
  return fetchFromTMDB('/trending/movie/day', { page });
}

/**
 * Popular movies, ranked by popularity.
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @returns {Promise<{ page:number, results:Array, total_pages:number }>}
 */
export function fetchPopularMovies({ page = 1 } = {}) {
  return fetchFromTMDB('/movie/popular', { page });
}

/**
 * Movies currently in theatres.
 * @param {object} [options]
 * @param {number} [options.page=1]
 */
export function fetchNowPlayingMovies({ page = 1 } = {}) {
  return fetchFromTMDB('/movie/now_playing', { page });
}

/**
 * Highest-rated movies.
 * @param {object} [options]
 * @param {number} [options.page=1]
 */
export function fetchTopRatedMovies({ page = 1 } = {}) {
  return fetchFromTMDB('/movie/top_rated', { page });
}

/**
 * Upcoming movies.
 * @param {object} [options]
 * @param {number} [options.page=1]
 */
export function fetchUpcomingMovies({ page = 1 } = {}) {
  return fetchFromTMDB('/movie/upcoming', { page });
}

/**
 * Trending TV shows (for the Series section).
 * @param {object} [options]
 * @param {'day'|'week'} [options.window='week']
 * @param {number} [options.page=1]
 */
export function fetchTrendingTV({ window = 'week', page = 1 } = {}) {
  return fetchFromTMDB(`/trending/tv/${window}`, { page });
}

/**
 * Popular TV shows.
 * @param {object} [options]
 * @param {number} [options.page=1]
 */
export function fetchPopularTV({ page = 1 } = {}) {
  return fetchFromTMDB('/tv/popular', { page });
}

/**
 * TV shows currently airing.
 * @param {object} [options]
 * @param {number} [options.page=1]
 */
export function fetchOnTheAirTV({ page = 1 } = {}) {
  return fetchFromTMDB('/tv/on_the_air', { page });
}

/**
 * Search for movies by (fuzzy) title.
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.page=1]
 * @returns {Promise<{ page:number, results:Array, total_pages:number, total_results:number }>}
 */
export function searchMovies(query, { page = 1 } = {}) {
  const trimmed = (query ?? '').trim();
  if (!trimmed) {
    return Promise.reject(new TMDBError('Please enter a search term.'));
  }
  return fetchFromTMDB('/search/movie', { query: trimmed, page, include_adult: 'false' });
}

/**
 * Full metadata for a single movie by its TMDb id.
 * @param {number|string} movieId
 * @returns {Promise<object>}
 */
export function fetchMovieDetails(movieId) {
  if (movieId == null || Number.isNaN(Number(movieId))) {
    return Promise.reject(new TMDBError('A valid movie id is required.'));
  }
  return fetchFromTMDB(`/movie/${movieId}`, {
    append_to_response: 'videos,credits,recommendations',
  });
}

// --- Image + display helpers -------------------------------------------------

/**
 * Builds a TMDb image URL for a given path and width, or null when absent.
 * @param {string|null} [path]  e.g. "/abc123.jpg"
 * @param {number} [width]      available widths vary by type (poster/backdrop)
 * @returns {string|null}
 */
export function getImageUrl(path, width = 342) {
  if (!path) return null;
  return `${IMAGE_BASE_URL}/w${width}${path}`;
}

/** Poster thumbnail (2:3 portrait). */
export function getPosterUrl(path, width = 342) {
  return getImageUrl(path, width);
}

/** Wide cinematic backdrop (16:9 landscape). */
export function getBackdropUrl(path, width = 1280) {
  return getImageUrl(path, width);
}

/** Rounds a TMDb 0–10 vote_average to one decimal, e.g. 8.5. */
export function formatRating(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return num.toFixed(1);
}

/** Extracts a 4-digit year from an ISO release date, or null. */
export function formatYear(dateString) {
  if (!dateString) return null;
  const year = new Date(dateString).getFullYear();
  return Number.isNaN(year) ? null : String(year);
}