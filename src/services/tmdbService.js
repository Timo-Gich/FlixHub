// ----------------------------------------------------------------------------
// The Movie Database (TMDb) v3 API service layer.
//
// All functions return Promises and throw structured errors so the UI can
// render loading / error states gracefully. The API key is read from the
// environment (the `TMDB_` prefix is explicitly exposed by Vite):
//
//   import.meta.env.TMDB_API_KEY
//
// Set it in your `.env` file (copy `.env.example` ➜ `.env`). A missing key
// throws a clear, actionable error instead of failing silently.
// ----------------------------------------------------------------------------

const API_KEY = import.meta.env.TMDB_API_KEY;
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
      'TMDb API key is missing. Copy .env.example to .env and set TMDB_API_KEY, then restart the dev server.',
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
 * Genres available for movies or TV shows.
 * @param {'movie'|'tv'} mediaType
 */
export function fetchGenres(mediaType) {
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return Promise.reject(new TMDBError('A valid media type (movie or tv) is required.'));
  }
  return fetchFromTMDB(`/genre/${mediaType}/list`);
}

/**
 * Discover movies or TV shows matching the supplied TMDb filters.
 * @param {'movie'|'tv'} mediaType
 * @param {object} filters
 * @param {number} [page=1]
 */
export function discoverTitles(mediaType, filters = {}, { page = 1 } = {}) {
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return Promise.reject(new TMDBError('A valid media type (movie or tv) is required.'));
  }
  return fetchFromTMDB(`/discover/${mediaType}`, { ...filters, page });
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
 * Trending movies and TV shows combined for mixed discovery surfaces.
 * Results alternate between movies and TV shows where both lists have data.
 */
export async function fetchTrendingAll({ page = 1 } = {}) {
  const [movies, shows] = await Promise.all([
    fetchTrendingMovies({ page }),
    fetchTrendingTV({ page }),
  ]);
  const movieResults = (movies.results ?? []).map((movie) => ({ ...movie, media_type: 'movie' }));
  const showResults = (shows.results ?? []).map((show) => ({ ...show, media_type: 'tv' }));
  const results = [];
  const maxLength = Math.max(movieResults.length, showResults.length);

  for (let index = 0; index < maxLength; index++) {
    if (movieResults[index]) results.push(movieResults[index]);
    if (showResults[index]) results.push(showResults[index]);
  }

  return { page, results };
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
 * Search for TV shows by title.
 * @param {string} query
 * @param {object} [options]
 * @param {number} [options.page=1]
 */
export function searchTV(query, { page = 1 } = {}) {
  const trimmed = (query ?? '').trim();
  if (!trimmed) {
    return Promise.reject(new TMDBError('Please enter a search term.'));
  }
  return fetchFromTMDB('/search/tv', { query: trimmed, page, include_adult: 'false' });
}

/**
 * Search movies and TV shows together. TMDb's multi-search endpoint returns
 * both media types in one response; people are excluded because this UI only
 * opens movie and TV detail pages.
 */
export async function searchAll(query, { page = 1 } = {}) {
  const trimmed = (query ?? '').trim();
  if (!trimmed) {
    return Promise.reject(new TMDBError('Please enter a search term.'));
  }
  const response = await fetchFromTMDB('/search/multi', {
    query: trimmed,
    page,
    include_adult: 'false',
  });
  const results = (response.results ?? []).filter(
    (result) => result.media_type === 'movie' || result.media_type === 'tv',
  );
  return {
    page: response.page ?? page,
    results,
    total_pages: response.total_pages ?? 1,
    total_results: results.length,
  };
}

/**
 * Full metadata for a TV series by id, including its seasons.
 * @param {number|string} id
 */
export function fetchTVDetails(id) {
  if (id == null || Number.isNaN(Number(id))) {
    return Promise.reject(new TMDBError('A valid TV id is required.'));
  }
  return fetchFromTMDB(`/tv/${id}`, {
    append_to_response: 'videos,credits,recommendations',
  });
}

/**
 * Selects the best available YouTube trailer or teaser from TMDb video data.
 * @param {Array<object>|{results?: Array<object>}|null|undefined} videos
 * @returns {string|null}
 */
export function getTrailerKey(videos) {
  const results = Array.isArray(videos) ? videos : videos?.results;
  if (!Array.isArray(results)) return null;

  const youtubeVideos = results.filter((video) => video?.site === 'YouTube' && video.key);
  return (
    youtubeVideos.find((video) => video.type === 'Trailer' && video.official === true)?.key ??
    youtubeVideos.find((video) => video.type === 'Teaser')?.key ??
    youtubeVideos[0]?.key ??
    null
  );
}

/**
 * The list of episodes for a given season of a TV series.
 * @param {number|string} id          TV series id
 * @param {number|string} seasonNumber
 */
export function fetchTVSeason(id, seasonNumber) {
  if (id == null || Number.isNaN(Number(id)) || seasonNumber == null) {
    return Promise.reject(new TMDBError('A valid TV id and season are required.'));
  }
  return fetchFromTMDB(`/tv/${id}/season/${seasonNumber}`, {});
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

/**
 * External ids for a movie (used by the VidSrc embed, which needs the IMDb id).
 * @param {number|string} movieId
 * @returns {Promise<{ imdb_id: (string|null), id: number }>}
 */
export function fetchMovieExternalIds(movieId) {
  if (movieId == null || Number.isNaN(Number(movieId))) {
    return Promise.reject(new TMDBError('A valid movie id is required.'));
  }
  return fetchFromTMDB(`/movie/${movieId}/external_ids`, {});
}

/**
 * External ids for a TV series (used by the VidSrc embed, which needs IMDb id).
 * @param {number|string} id
 * @returns {Promise<{ imdb_id: (string|null), id: number }>}
 */
export function fetchTVExternalIds(id) {
  if (id == null || Number.isNaN(Number(id))) {
    return Promise.reject(new TMDBError('A valid TV id is required.'));
  }
  return fetchFromTMDB(`/tv/${id}/external_ids`, {});
}

/**
 * Images available for a movie or TV title. The response contains the official
 * `logos` array (plus backdrops/posters) used to render TMDb title logos.
 * @param {'movie'|'tv'} mediaType
 * @param {number|string} id
 * @returns {Promise<{ logos:Array, backdrops:Array, posters:Array }>}
 */
export function fetchMediaImages(mediaType, id) {
  if (mediaType !== 'movie' && mediaType !== 'tv') {
    return Promise.reject(new TMDBError('A valid media type (movie or tv) is required.'));
  }
  if (id == null || Number.isNaN(Number(id))) {
    return Promise.reject(new TMDBError('A valid title id is required.'));
  }
  return fetchFromTMDB(`/${mediaType}/${id}/images`, {});
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

/** Portrait headshot for cast members (used on detail pages). */
export function getProfileUrl(path, width = 185) {
  return getImageUrl(path, width);
}

/** Wide cinematic backdrop (16:9 landscape). */
export function getBackdropUrl(path, width = 1280) {
  return getImageUrl(path, width);
}

/** Preferred width for hero title logos (upscaled cleanly, kept sharp). */
const LOGO_DISPLAY_WIDTH = 780;

/**
 * Picks the best candidate from a TMDb `logos` array and returns its image URL.
 *
 * TMDb returns every localized version of a title's logo, each tagged with an
 * `iso_639_1` language code (`null` = language-neutral, e.g. a stylized mark
 * with no lettering). To keep the hero in English we score candidates in this
 * order: English logos > language-neutral logos > any other language. Within a
 * preference tier we prefer horizontal wordmarks (aspect_ratio >= 1) and then
 * the largest width. If no high-priority tier has a logo we never hold the hero
 * hostage to an English logo and fall back to whatever exists.
 *
 * @param {Array<{ file_path:string, aspect_ratio:number, width:number, iso_639_1:string|null }>} [logos]
 * @returns {string|null}
 */
export function getLogoUrl(logos, width = LOGO_DISPLAY_WIDTH) {
  const candidates = Array.isArray(logos) ? logos.filter((logo) => logo?.file_path) : [];
  if (!candidates.length) return null;

  // Higher = more preferred. English first, then language-neutral, then other.
  const languagePriority = (logo) => {
    const lang = logo.iso_639_1 ?? null;
    if (lang === 'en') return 3;
    if (lang === null || lang === 'xx') return 2;
    return 1;
  };

  // Prefer the widest logo within a group, but break ties toward horizontal
  // wordmarks (wide aspect ratio) which render better in the hero.
  const pickBest = (pool) =>
    pool.sort((a, b) => {
      const widthDiff = (b.width ?? 0) - (a.width ?? 0);
      if (widthDiff !== 0) return widthDiff;
      return (b.aspect_ratio ?? 0) - (a.aspect_ratio ?? 0);
    })[0];

  // Pick the strongest tier that still contains a horizontal wordmark; the
  // tier is guaranteed to have candidates by construction.
  const tiers = [3, 2, 1];
  for (const priority of tiers) {
    const tier = candidates.filter((logo) => languagePriority(logo) === priority);
    if (!tier.length) continue;
    const horizontal = tier.filter((logo) => (logo.aspect_ratio ?? 0) >= 1);
    return `${IMAGE_BASE_URL}/w${width}${pickBest(horizontal.length ? horizontal : tier).file_path}`;
  }

  return null;
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

/** Formats a runtime in minutes into "2h 12m" (or "45m"). */
export function formatRuntime(totalMinutes) {
  const minutes = Number(totalMinutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}