import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import MovieCard from '../components/MovieCard';
import DiscoveryRow from '../components/DiscoveryRow';
import SectionHeading from '../components/SectionHeading';
import TrailerModal from '../components/TrailerModal';
import { useLibrary } from '../hooks/useLibrary.jsx';
import { useMovieData } from '../hooks/useMovieData';
import {
  discoverTitles,
  fetchGenres,
  fetchMovieDetails,
  fetchNowPlayingMovies,
  fetchOnTheAirTV,
  fetchPopularMovies,
  fetchPopularTV,
  fetchTopRatedMovies,
  fetchTrendingAll,
  fetchTVDetails,
  fetchUpcomingMovies,
  formatRating,
  formatYear,
  getBackdropUrl,
  getTrailerKey,
} from '../services/tmdbService';

const LANGUAGES = [
  { name: 'English', code: 'en' },
  { name: 'Korean', code: 'ko' },
  { name: 'French', code: 'fr' },
  { name: 'Spanish', code: 'es' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Chinese', code: 'zh' },
  { name: 'Italian', code: 'it' },
  { name: 'German', code: 'de' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Tamil', code: 'ta' },
  { name: 'Turkish', code: 'tr' },
  { name: 'Arabic', code: 'ar' },
  { name: 'Russian', code: 'ru' },
  { name: 'Thai', code: 'th' },
  { name: 'Swedish', code: 'sv' },
];

const SORT_OPTIONS = [
  { value: 'popularity.desc', label: 'Popularity' },
  { value: 'vote_average.desc', label: 'Rating' },
  { value: 'release_date.desc', label: 'Release date' },
  { value: 'original_title.asc', label: 'Title A–Z' },
];

const withMediaType = (items, mediaType) =>
  (items ?? []).map((item) => ({ ...item, media_type: mediaType }));

async function fetchRecentlyReleased() {
  const [movies, shows] = await Promise.all([fetchNowPlayingMovies(), fetchOnTheAirTV()]);
  return [
    ...withMediaType(movies.results, 'movie'),
    ...withMediaType(shows.results, 'tv'),
  ]
    .sort((a, b) => {
      const dateA = a.release_date ?? a.first_air_date ?? '';
      const dateB = b.release_date ?? b.first_air_date ?? '';
      return dateB.localeCompare(dateA);
    })
    .slice(0, 20);
}

async function fetchTopRatedAll() {
  const [movies, shows] = await Promise.all([
    fetchTopRatedMovies(),
    discoverTitles('tv', {
      sort_by: 'vote_average.desc',
      'vote_count.gte': '200',
    }),
  ]);
  return [
    ...withMediaType(movies.results, 'movie'),
    ...withMediaType(shows.results, 'tv'),
  ]
    .filter((item) => (item.vote_count ?? 0) >= 200)
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
    .slice(0, 20);
}

async function fetchHiddenGems() {
  const [movies, shows] = await Promise.all(
    ['movie', 'tv'].map((type) =>
      discoverTitles(type, {
        'vote_average.gte': '7.3',
        'vote_count.gte': '250',
        sort_by: 'popularity.asc',
      }),
    ),
  );
  return [
    ...withMediaType(movies.results, 'movie'),
    ...withMediaType(shows.results, 'tv'),
  ]
    .filter((item) => (item.vote_count ?? 0) >= 250 && (item.popularity ?? Infinity) <= 80)
    .sort((a, b) => (b.vote_average ?? 0) - (a.vote_average ?? 0))
    .slice(0, 20);
}

async function fetchLowkeyTitles() {
  const [movies, shows] = await Promise.all(
    ['movie', 'tv'].map((type) =>
      discoverTitles(type, {
        'vote_average.gte': '7',
        'vote_count.gte': '150',
        'popularity.lte': '35',
        sort_by: 'popularity.asc',
      }),
    ),
  );
  return [
    ...withMediaType(movies.results, 'movie'),
    ...withMediaType(shows.results, 'tv'),
  ].filter((item) =>
    (item.vote_average ?? 0) >= 7
    && (item.vote_count ?? 0) >= 150
    && (item.popularity ?? Infinity) <= 35);
}

function DiscoverResults({
  mediaType,
  genreId,
  languageCode,
  yearFrom,
  yearTo,
  minRating,
  sortBy,
}) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const pageRef = useRef(1);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);
  const filtersRef = useRef({});
  const yearRangeInvalid = Boolean(yearFrom && yearTo && Number(yearFrom) > Number(yearTo));
  const dateField = mediaType === 'tv' ? 'first_air_date' : 'primary_release_date';

  filtersRef.current = {
    ...(genreId ? { with_genres: genreId } : {}),
    ...(languageCode ? { with_original_language: languageCode } : {}),
    ...(yearFrom && !yearRangeInvalid ? { [`${dateField}.gte`]: `${yearFrom}-01-01` } : {}),
    ...(yearTo && !yearRangeInvalid ? { [`${dateField}.lte`]: `${yearTo}-12-31` } : {}),
    ...(minRating ? { 'vote_average.gte': minRating } : {}),
    sort_by: sortBy === 'release_date.desc'
      ? `${dateField}.desc`
      : sortBy === 'original_title.asc'
        ? `${mediaType === 'tv' ? 'name' : 'original_title'}.asc`
        : sortBy,
  };

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore || yearRangeInvalid) return;
    loadingRef.current = true;
    setLoadingMore(true);
    setError(null);
    const page = pageRef.current + 1;

    try {
      const response = await discoverTitles(mediaType, filtersRef.current, { page });
      setResults((current) => {
        const seen = new Set(current.map((item) => `${mediaType}-${item.id}`));
        const nextResults = (response.results ?? [])
          .filter((item) => {
            const key = `${mediaType}-${item.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((item) => ({ ...item, media_type: mediaType }));
        return [...current, ...nextResults];
      });
      pageRef.current = page;
      setHasMore(page < Math.min(response.total_pages ?? page, 500));
    } catch (requestError) {
      setError(requestError);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, mediaType, yearRangeInvalid]);

  useEffect(() => {
    let active = true;
    pageRef.current = 1;
    setResults([]);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHasMore(true);

    if (yearRangeInvalid) {
      setLoading(false);
      setHasMore(false);
      return () => {
        active = false;
      };
    }

    loadingRef.current = true;
    discoverTitles(mediaType, filtersRef.current, { page: 1 })
      .then((response) => {
        if (!active) return;
        const seen = new Set();
        const firstPage = (response.results ?? [])
          .filter((item) => {
            const key = `${mediaType}-${item.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map((item) => ({ ...item, media_type: mediaType }));
        setResults(firstPage);
        setHasMore(1 < Math.min(response.total_pages ?? 1, 500));
      })
      .catch((requestError) => {
        if (active) setError(requestError);
      })
      .finally(() => {
        if (!active) return;
        loadingRef.current = false;
        setLoading(false);
      });

    return () => {
      active = false;
      loadingRef.current = false;
    };
  }, [
    genreId,
    languageCode,
    mediaType,
    minRating,
    retryCount,
    sortBy,
    yearFrom,
    yearRangeInvalid,
    yearTo,
  ]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore || loading || loadingMore || error) return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: '500px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, hasMore, loadMore, loading, loadingMore]);

  const retry = () => {
    if (results.length === 0) {
      setError(null);
      setRetryCount((count) => count + 1);
      return;
    }
    loadMore();
  };

  return (
    <section aria-label="Discover results" aria-live="polite">
      {loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <div key={index} className="aspect-[2/3] animate-pulse rounded-md bg-ink-raised" />
          ))}
        </div>
      )}

      {!loading && yearRangeInvalid && (
        <p className="rounded-xl border border-ink-border bg-ink-soft px-4 py-8 text-center text-sm text-muted">
          The start year must be earlier than or equal to the end year.
        </p>
      )}

      {!loading && !yearRangeInvalid && results.length === 0 && !error && (
        <p className="rounded-xl border border-ink-border bg-ink-soft px-4 py-10 text-center text-sm text-muted">
          No titles found for these filters.
        </p>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {results.map((movie) => (
            <MovieCard key={`${mediaType}-${movie.id}`} movie={movie} />
          ))}
        </div>
      )}

      {error && (
        <div className="my-8 rounded-xl border border-brand/30 bg-brand/5 px-4 py-6 text-center">
          <p className="mb-2 font-semibold text-white">We couldn’t load more titles.</p>
          <p className="mx-auto mb-4 max-w-lg text-sm text-muted">{error.message}</p>
          <button
            type="button"
            onClick={retry}
            className="rounded-md bg-brand px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-dark"
          >
            Try again
          </button>
        </div>
      )}

      {hasMore && !yearRangeInvalid && (
        <div ref={sentinelRef} className="h-8" aria-hidden="true" />
      )}
      {!loading && hasMore && !yearRangeInvalid && !error && (
        <div className="flex flex-col items-center gap-3 py-6">
          {loadingMore && <p className="text-sm text-muted" role="status">Loading more titles…</p>}
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="rounded-full border border-ink-border px-5 py-2 text-sm font-semibold text-muted
                       transition hover:border-brand hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
      {!loading && !hasMore && results.length > 0 && (
        <p className="py-8 text-center text-sm text-muted">You’re all caught up.</p>
      )}
    </section>
  );
}

function FeaturePanel({ movie, loading, error, reload, genres }) {
  const [trailerId, setTrailerId] = useState(null);
  const [trailerLoading, setTrailerLoading] = useState(false);
  const [trailerError, setTrailerError] = useState('');
  const [trailerOpen, setTrailerOpen] = useState(false);

  useEffect(() => {
    setTrailerId(null);
    setTrailerError('');
    setTrailerOpen(false);
  }, [movie?.id, movie?.media_type]);

  const loadTrailer = async () => {
    if (trailerId) {
      setTrailerOpen(true);
      return;
    }
    setTrailerLoading(true);
    setTrailerError('');
    try {
      const details = movie.media_type === 'tv'
        ? await fetchTVDetails(movie.id)
        : await fetchMovieDetails(movie.id);
      const key = getTrailerKey(details.videos?.results);
      if (!key) {
        setTrailerError('No trailer is available for this title.');
        return;
      }
      setTrailerId(key);
      setTrailerOpen(true);
    } catch (requestError) {
      setTrailerError(requestError.message);
    } finally {
      setTrailerLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mb-10 h-[350px] animate-pulse rounded-2xl bg-ink-raised sm:h-[390px]" aria-label="Loading featured title" />
    );
  }

  if (error || !movie) {
    return (
      <div className="mb-10 flex min-h-64 items-center justify-center rounded-2xl border border-ink-border bg-ink-soft px-6 text-center">
        <div>
          <p className="text-sm text-muted">{error?.message ?? 'No featured title is available right now.'}</p>
          {error && (
            <button type="button" onClick={reload} className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-bold text-white">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const title = movie.title || movie.name || 'Featured title';
  const backdrop = getBackdropUrl(movie.backdrop_path, 1280);
  const detailPath = movie.media_type === 'tv' ? `/tv/${movie.id}` : `/movie/${movie.id}`;
  const year = formatYear(movie.release_date ?? movie.first_air_date);
  const rating = formatRating(movie.vote_average);
  const genreLabels = (movie.genre_ids ?? [])
    .map((id) => genres.find((genre) => genre.id === id)?.name)
    .filter(Boolean)
    .slice(0, 3);

  return (
    <>
      <section
        aria-label="Featured title"
        className="relative mb-10 min-h-[350px] overflow-hidden rounded-2xl border border-white/5 bg-ink-soft sm:min-h-[390px]"
      >
        {backdrop && (
          <img
            src={backdrop}
            alt=""
            loading="eager"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
        <div className="relative flex min-h-[350px] max-w-2xl flex-col justify-end px-5 py-7 sm:min-h-[390px] sm:px-10 sm:py-10">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-brand-light">Featured on FlixHub</p>
          <h2 className="font-display text-3xl font-semibold leading-tight text-white text-shadow-hero sm:text-5xl">
            {title}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/85">
            {year && <span>{year}</span>}
            {rating && <span>★ {rating}</span>}
            {genreLabels.map((genre) => <span key={genre}>{genre}</span>)}
          </div>
          {movie.overview && (
            <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-6 text-white/80 sm:text-base">
              {movie.overview}
            </p>
          )}
          {trailerError && <p role="status" className="mt-3 text-sm text-red-200">{trailerError}</p>}
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadTrailer}
              disabled={trailerLoading}
              className="rounded-md bg-brand px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-dark
                         disabled:cursor-wait disabled:opacity-70"
            >
              {trailerLoading ? 'Loading trailer…' : '▶ Watch trailer'}
            </button>
            <Link
              to={detailPath}
              className="rounded-md border border-white/35 bg-black/30 px-5 py-3 text-sm font-bold text-white
                         transition hover:border-white hover:bg-white/10"
            >
              View details
            </Link>
          </div>
        </div>
      </section>

      {trailerOpen && trailerId && (
        <TrailerModal videoKey={trailerId} onClose={() => setTrailerOpen(false)} />
      )}
    </>
  );
}

function PersonalizedRecommendations() {
  const { history } = useLibrary();
  const latestEntry = [...history]
    .filter((entry) => entry?.movie?.id)
    .sort((a, b) => (b.updatedAt || b.watchedAt || 0) - (a.updatedAt || a.watchedAt || 0))[0];
  const source = latestEntry?.movie;
  const mediaType = latestEntry?.type === 'tv' || source?.media_type === 'tv' || (source?.name && !source?.title)
    ? 'tv'
    : 'movie';
  const {
    data,
    loading,
    error,
    reload,
  } = useMovieData(
    () => {
      if (!source?.id) return Promise.resolve({ results: [] });
      const request = mediaType === 'tv' ? fetchTVDetails(source.id) : fetchMovieDetails(source.id);
      return request.then((details) => ({
        results: withMediaType(details.recommendations?.results, mediaType)
          .filter((item) => item.id !== source.id)
          .slice(0, 20),
      }));
    },
    [mediaType, source?.id],
  );

  if (!source) {
    return (
      <section className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8" aria-label="Recommendations">
        <SectionHeading className="text-xl md:text-2xl">Picked from your history</SectionHeading>
        <p className="mt-2 text-sm text-muted">
          Watch a title and recommendations based on your viewing history will appear here.
        </p>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8" aria-label="Recommendations">
        <SectionHeading className="text-xl md:text-2xl">Picked from your history</SectionHeading>
        <div className="mt-4 flex gap-3 overflow-hidden" aria-label="Loading recommendations">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="aspect-[2/3] w-[38vw] shrink-0 animate-pulse rounded-md bg-ink-raised sm:w-40" />
          ))}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8" aria-label="Recommendations">
        <SectionHeading className="text-xl md:text-2xl">Picked from your history</SectionHeading>
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand/5 px-4 py-5">
          <p className="text-sm text-muted">{error.message}</p>
          <button type="button" onClick={reload} className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-bold text-white">
            Try again
          </button>
        </div>
      </section>
    );
  }

  if (!data?.results?.length) {
    return (
      <section className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8" aria-label="Recommendations">
        <SectionHeading className="text-xl md:text-2xl">Picked from your history</SectionHeading>
        <p className="mt-2 text-sm text-muted">TMDb has no recommendations for your most recently watched title yet.</p>
      </section>
    );
  }

  return (
    <DiscoveryRow
      id={`recommendations-${mediaType}-${source.id}`}
      title="Picked from your history"
      description={`Because you watched ${source.title || source.name || 'this title'}.`}
      fetcher={() => data.results}
    />
  );
}

export default function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [mediaType, setMediaType] = useState('movie');
  const [genreId, setGenreId] = useState('');
  const [languageCode, setLanguageCode] = useState(() => searchParams.get('language') ?? '');
  const [yearFrom, setYearFrom] = useState('');
  const [yearTo, setYearTo] = useState('');
  const [minRating, setMinRating] = useState('');
  const [sortBy, setSortBy] = useState('popularity.desc');
  const [surprise, setSurprise] = useState(null);
  const [surpriseLoading, setSurpriseLoading] = useState(false);
  const [surpriseError, setSurpriseError] = useState('');
  const surpriseCandidatesRef = useRef(null);
  const recentSurpriseIds = useRef([]);

  const {
    data: genreData,
    loading: genresLoading,
    error: genresError,
    reload: reloadGenres,
  } = useMovieData(async () => {
    const [movies, shows] = await Promise.all([fetchGenres('movie'), fetchGenres('tv')]);
    return { movie: movies.genres ?? [], tv: shows.genres ?? [] };
  }, []);
  const {
    data: trendingData,
    loading: trendingLoading,
    error: trendingError,
    reload: reloadTrending,
  } = useMovieData(fetchTrendingAll, []);

  const genres = genreData?.[mediaType] ?? [];
  const selectedGenre = genres.find((genre) => String(genre.id) === genreId);
  const featured = (trendingData?.results ?? []).find((item) => item.backdrop_path)
    ?? trendingData?.results?.[0]
    ?? null;
  const trending = (trendingData?.results ?? []).slice(0, 20);

  const updateLanguage = (code) => {
    setLanguageCode(code);
    const nextParams = new URLSearchParams(searchParams);
    if (code) nextParams.set('language', code);
    else nextParams.delete('language');
    nextParams.delete('tab');
    setSearchParams(nextParams);
  };

  const clearFilters = () => {
    setGenreId('');
    updateLanguage('');
    setYearFrom('');
    setYearTo('');
    setMinRating('');
    setSortBy('popularity.desc');
  };

  const chooseSurprise = async () => {
    if (surpriseLoading) return;
    setSurpriseLoading(true);
    setSurpriseError('');
    try {
      if (!surpriseCandidatesRef.current?.length) {
        surpriseCandidatesRef.current = await fetchLowkeyTitles();
      }
      const trendingIds = new Set(
        (trendingData?.results ?? []).map((item) => `${item.media_type}-${item.id}`),
      );
      const candidates = surpriseCandidatesRef.current.filter((item) =>
        !trendingIds.has(`${item.media_type}-${item.id}`));
      const available = candidates.filter(
        (item) => !recentSurpriseIds.current.includes(`${item.media_type}-${item.id}`),
      );
      if (available.length === 0) {
        setSurpriseError('No under-the-radar picks are available right now. Try again shortly.');
        return;
      }
      const pick = available[Math.floor(Math.random() * available.length)];
      const pickId = `${pick.media_type}-${pick.id}`;
      recentSurpriseIds.current = [
        pickId,
        ...recentSurpriseIds.current,
      ].slice(0, Math.min(5, candidates.length - 1));
      setSurprise(pick);
    } catch (requestError) {
      setSurpriseError(requestError.message);
    } finally {
      setSurpriseLoading(false);
    }
  };

  const activeFilters = [
    ...(selectedGenre ? [{
      label: `Genre: ${selectedGenre.name}`,
      clear: () => setGenreId(''),
    }] : []),
    ...(languageCode ? [{
      label: `Language: ${LANGUAGES.find((item) => item.code === languageCode)?.name ?? languageCode}`,
      clear: () => updateLanguage(''),
    }] : []),
    ...(yearFrom || yearTo ? [{
      label: `Years: ${yearFrom || 'Any'}–${yearTo || 'Any'}`,
      clear: () => { setYearFrom(''); setYearTo(''); },
    }] : []),
    ...(minRating ? [{
      label: `Rating: ${minRating}+`,
      clear: () => setMinRating(''),
    }] : []),
    ...(sortBy !== 'popularity.desc' ? [{
      label: `Sort: ${SORT_OPTIONS.find((option) => option.value === sortBy)?.label ?? sortBy}`,
      clear: () => setSortBy('popularity.desc'),
    }] : []),
  ];

  const rows = [
    ...(trending.length ? [{
      id: 'trending-all',
      title: 'Trending now',
      description: 'The movies and shows everyone is talking about.',
      fetcher: () => trending,
      seeAll: '/new-popular',
    }] : []),
    {
      id: 'popular-movies',
      title: 'Popular movies',
      description: 'Big stories finding a wide audience.',
      fetcher: fetchPopularMovies,
      seeAll: '/movies',
    },
    {
      id: 'popular-tv',
      title: 'Popular TV shows',
      description: 'Series worth settling in for.',
      fetcher: fetchPopularTV,
      seeAll: '/series',
    },
    {
      id: 'recently-released',
      title: 'Recently released',
      description: 'New arrivals in theatres and on television.',
      fetcher: fetchRecentlyReleased,
    },
    {
      id: 'top-rated',
      title: 'Top rated',
      description: 'Highly rated picks with enough votes to count.',
      fetcher: fetchTopRatedAll,
    },
    {
      id: 'hidden-gems',
      title: 'Hidden gems',
      description: 'Well-reviewed titles beyond the usual blockbusters.',
      fetcher: fetchHiddenGems,
    },
    {
      id: 'coming-soon',
      title: 'Coming soon',
      description: 'A look at upcoming movie releases.',
      fetcher: fetchUpcomingMovies,
      seeAll: '/new-popular',
    },
  ];

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />
      <main className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-28 sm:px-8">
        <header className="mb-7 max-w-3xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-brand-light">
            Find your next favorite
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Discover
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
            Find your next favourite. Explore stories worth watching.
          </p>
        </header>

        <FeaturePanel
          movie={featured}
          loading={trendingLoading}
          error={trendingError}
          reload={reloadTrending}
          genres={genres}
        />

        <section className="mb-10 rounded-2xl border border-ink-border bg-ink-soft p-5 sm:p-7" aria-labelledby="next-watch-heading">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-brand-light">Your next watch</p>
              <SectionHeading as="h2" className="text-xl md:text-2xl" id="next-watch-heading">
                Find a hidden gem
              </SectionHeading>
              <p className="mt-2 text-sm text-muted">Find a well-rated movie or show with a smaller audience.</p>
            </div>
            <button
              type="button"
              onClick={chooseSurprise}
              disabled={surpriseLoading}
              className="rounded-full bg-brand px-5 py-3 text-sm font-bold text-white transition
                         hover:bg-brand-dark active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
            >
              {surpriseLoading ? 'Finding a hidden pick…' : 'Surprise me'}
            </button>
          </div>
          {surpriseError && (
            <p role="status" className="mt-3 text-sm text-red-200">{surpriseError}</p>
          )}
          {surprise && (
            <div className="mt-6 flex flex-col gap-4 rounded-xl border border-white/10 bg-black/25 p-4 sm:flex-row sm:items-center">
              <div className="w-24 shrink-0 sm:w-28">
                <MovieCard movie={surprise} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-light">A surprise pick</p>
                <h3 className="mt-2 text-xl font-bold text-white">{surprise.title || surprise.name}</h3>
                <p className="mt-2 text-sm text-muted">
                  {formatRating(surprise.vote_average) ? `★ ${formatRating(surprise.vote_average)} · ` : ''}
                  {formatYear(surprise.release_date ?? surprise.first_air_date) || 'A hidden pick'}
                </p>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-foreground/80">
                  {surprise.overview || 'Open the title to explore more details.'}
                </p>
                <Link
                  to={surprise.media_type === 'tv' ? `/tv/${surprise.id}` : `/movie/${surprise.id}`}
                  state={{ from: `${location.pathname}${location.search}${location.hash}` }}
                  className="mt-4 inline-flex rounded-md border border-ink-border px-4 py-2 text-sm font-semibold text-white
                             transition hover:border-brand hover:bg-brand"
                >
                  View details
                </Link>
              </div>
            </div>
          )}
        </section>

        <section id="discover-filters" className="mb-10 scroll-mt-24" aria-labelledby="genre-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <SectionHeading as="h2" className="text-lg md:text-xl" id="genre-heading">
                Explore & filter
              </SectionHeading>
              <p className="mt-2 text-sm text-muted">Combine a genre, language, release period and rating.</p>
            </div>
            {activeFilters.length > 0 && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full border border-ink-border px-4 py-2 text-sm font-semibold text-muted
                           transition hover:border-brand hover:text-white"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-full border border-ink-border bg-ink-soft p-1" aria-label="Content type">
              {[
                { id: 'movie', label: 'Movies' },
                { id: 'tv', label: 'TV Shows' },
              ].map((type) => (
                <button
                  key={type.id}
                  type="button"
                  aria-pressed={mediaType === type.id}
                  onClick={() => {
                    setMediaType(type.id);
                    setGenreId('');
                  }}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                    mediaType === type.id ? 'bg-brand text-white shadow' : 'text-muted hover:text-white'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>

            <label className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="font-semibold text-white">Language</span>
              <select
                value={languageCode}
                onChange={(event) => updateLanguage(event.target.value)}
                className="min-w-36 rounded-full border border-ink-border bg-ink-soft px-4 py-2.5 text-sm text-white outline-none transition focus:border-brand"
              >
                <option value="">All languages</option>
                {LANGUAGES.map((language) => (
                  <option key={language.code} value={language.code}>
                    {language.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="font-semibold text-white">Min rating</span>
              <select
                value={minRating}
                onChange={(event) => setMinRating(event.target.value)}
                className="rounded-full border border-ink-border bg-ink-soft px-4 py-2.5 text-sm text-white outline-none transition focus:border-brand"
              >
                <option value="">Any</option>
                {[5, 6, 7, 8, 9].map((rating) => <option key={rating} value={rating}>{rating}+</option>)}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="font-semibold text-white">Sort</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="rounded-full border border-ink-border bg-ink-soft px-4 py-2.5 text-sm text-white outline-none transition focus:border-brand"
              >
                {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>

            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold text-white">Years</span>
              <label>
                <span className="sr-only">From year</span>
                <input
                  type="number"
                  min="1900"
                  max={new Date().getFullYear()}
                  placeholder="From"
                  value={yearFrom}
                  onChange={(event) => setYearFrom(event.target.value)}
                  className="w-24 rounded-full border border-ink-border bg-ink-soft px-3 py-2.5 text-white outline-none placeholder:text-muted focus:border-brand"
                />
              </label>
              <span className="text-muted">–</span>
              <label>
                <span className="sr-only">To year</span>
                <input
                  type="number"
                  min="1900"
                  max={new Date().getFullYear()}
                  placeholder="To"
                  value={yearTo}
                  onChange={(event) => setYearTo(event.target.value)}
                  className="w-24 rounded-full border border-ink-border bg-ink-soft px-3 py-2.5 text-white outline-none placeholder:text-muted focus:border-brand"
                />
              </label>
            </div>
          </div>

          {genresLoading && (
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: 10 }).map((_, index) => (
                <div key={index} className="h-10 w-24 animate-pulse rounded-full bg-ink-raised" />
              ))}
            </div>
          )}
          {genresError && (
            <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-6 text-center">
              <p className="mb-2 text-sm text-muted">{genresError.message}</p>
              <button
                type="button"
                onClick={reloadGenres}
                className="rounded-md bg-brand px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-dark"
              >
                Retry genres
              </button>
            </div>
          )}
          {!genresLoading && !genresError && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={!genreId}
                onClick={() => setGenreId('')}
                className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  !genreId
                    ? 'border-brand bg-brand text-white'
                    : 'border-ink-border bg-ink-soft text-muted hover:border-brand/60 hover:text-white'
                }`}
              >
                All genres
              </button>
              {genres.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  aria-pressed={genreId === String(genre.id)}
                  onClick={() => setGenreId((current) => current === String(genre.id) ? '' : String(genre.id))}
                  className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                    genreId === String(genre.id)
                      ? 'border-brand bg-brand text-white'
                      : 'border-ink-border bg-ink-soft text-muted hover:border-brand/60 hover:text-white'
                  }`}
                >
                  {genre.name}
                </button>
              ))}
            </div>
          )}

          {activeFilters.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2" aria-label="Applied filters">
              {activeFilters.map((filter) => (
                <button
                  key={filter.label}
                  type="button"
                  onClick={filter.clear}
                  aria-label={`Remove ${filter.label} filter`}
                  className="inline-flex items-center gap-2 rounded-full border border-brand/40 bg-brand/10 px-3 py-1.5
                             text-xs font-semibold text-white transition hover:bg-brand/25"
                >
                  {filter.label} <span aria-hidden="true">×</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <div className="mb-5">
          <SectionHeading as="h2" className="text-lg md:text-xl">
            {selectedGenre?.name || 'Browse'}{languageCode ? ` · ${LANGUAGES.find((item) => item.code === languageCode)?.name ?? languageCode}` : ''}
            {' · '}{mediaType === 'tv' ? 'TV Shows' : 'Movies'}
          </SectionHeading>
        </div>
        <DiscoverResults
          key={`${mediaType}-${genreId}-${languageCode}-${yearFrom}-${yearTo}-${minRating}-${sortBy}`}
          mediaType={mediaType}
          genreId={genreId}
          languageCode={languageCode}
          yearFrom={yearFrom}
          yearTo={yearTo}
          minRating={minRating}
          sortBy={sortBy}
        />

        <PersonalizedRecommendations />

        {rows.map((row) => (
          <DiscoveryRow key={row.id} {...row} />
        ))}
      </main>
    </div>
  );
}
