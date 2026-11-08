import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import MovieCard from '../components/MovieCard';
import SectionHeading from '../components/SectionHeading';
import { useMovieData } from '../hooks/useMovieData';
import { discoverTitles, fetchGenres } from '../services/tmdbService';

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

function DiscoverResults({ mediaType, genreId, languageCode }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(1);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);
  const filtersRef = useRef({});
  filtersRef.current = {
    ...(genreId ? { with_genres: genreId } : {}),
    ...(languageCode ? { with_original_language: languageCode } : {}),
    sort_by: 'popularity.desc',
  };

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoadingMore(true);
    setError(null);
    const page = pageRef.current + 1;

    try {
      const response = await discoverTitles(mediaType, filtersRef.current, { page });
      setResults((current) => {
        const seen = new Set(current.map((item) => `${mediaType}-${item.id}`));
        const nextResults = response.results
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
  }, [hasMore, mediaType]);

  useEffect(() => {
    let active = true;
    loadingRef.current = true;
    pageRef.current = 1;
    setResults([]);
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setHasMore(true);

    discoverTitles(mediaType, filtersRef.current, { page: 1 })
      .then((response) => {
        if (!active) return;
        const seen = new Set();
        const firstPage = response.results
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
  }, [mediaType, genreId, languageCode]);

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
      setLoading(true);
      loadingRef.current = true;
      discoverTitles(mediaType, filtersRef.current, { page: 1 })
        .then((response) => {
          const seen = new Set();
          setResults(response.results
            .filter((item) => {
              const key = `${mediaType}-${item.id}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            })
            .map((item) => ({ ...item, media_type: mediaType })));
          pageRef.current = 1;
          setHasMore(1 < Math.min(response.total_pages ?? 1, 500));
        })
        .catch(setError)
        .finally(() => {
          loadingRef.current = false;
          setLoading(false);
        });
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

      {!loading && results.length === 0 && !error && (
        <p className="rounded-xl border border-ink-border bg-ink-soft px-4 py-10 text-center text-sm text-muted">
          No titles found for these filters.
        </p>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {results.map((movie, index) => (
            <MovieCard key={`${mediaType}-${movie.id}`} movie={movie} index={index + 1} />
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

      {hasMore && (
        <div ref={sentinelRef} className="h-8" aria-hidden="true" />
      )}
      {!loading && hasMore && !error && (
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

export default function DiscoverPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [mediaType, setMediaType] = useState('movie');
  const [genreId, setGenreId] = useState('');
  const [languageCode, setLanguageCode] = useState(() => searchParams.get('language') ?? '');
  const {
    data: genreData,
    loading: genresLoading,
    error: genresError,
    reload: reloadGenres,
  } = useMovieData(async () => {
    const [movies, shows] = await Promise.all([fetchGenres('movie'), fetchGenres('tv')]);
    return { movie: movies.genres ?? [], tv: shows.genres ?? [] };
  }, []);

  const genres = genreData?.[mediaType] ?? [];
  const selectedGenre = genres.find((genre) => String(genre.id) === genreId);

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
  };

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />
      <main className="mx-auto w-full max-w-[1600px] px-4 pb-16 pt-28 sm:px-8">
        <header className="mb-8 max-w-3xl">
          <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-brand-light">
            Find your next favorite
          </p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Discover
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
            Explore movies and shows by genre and original language.
          </p>
        </header>

        <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex rounded-full border border-ink-border bg-ink-soft p-1" aria-label="Media type">
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

          <label className="flex items-center gap-3 text-sm text-muted">
            <span className="font-semibold text-white">Original language</span>
            <select
              value={languageCode}
              onChange={(event) => updateLanguage(event.target.value)}
              className="min-w-40 rounded-full border border-ink-border bg-ink-soft px-4 py-2.5 text-sm text-white
                         outline-none transition focus:border-brand"
            >
              <option value="">All languages</option>
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name} ({language.code})
                </option>
              ))}
            </select>
          </label>
        </div>

        <section className="mb-9" aria-labelledby="genre-heading">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <SectionHeading as="h2" className="text-lg md:text-xl" id="genre-heading">
                Genres
              </SectionHeading>
              <p className="mt-2 text-sm text-muted">Choose a genre, then refine by language if you like.</p>
            </div>
            {(genreId || languageCode) && (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-full border border-ink-border px-4 py-2 text-sm font-semibold text-muted
                           transition hover:border-brand hover:text-white"
              >
                Clear filters
              </button>
            )}
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
        </section>

        <div className="mb-5">
          <SectionHeading as="h2" className="text-lg md:text-xl">
            {selectedGenre?.name || 'Popular'} {languageCode ? `· ${LANGUAGES.find((item) => item.code === languageCode)?.name ?? languageCode}` : ''}
            {' · '}{mediaType === 'tv' ? 'TV Shows' : 'Movies'}
          </SectionHeading>
        </div>
        <DiscoverResults
          key={`${mediaType}-${genreId}-${languageCode}`}
          mediaType={mediaType}
          genreId={genreId}
          languageCode={languageCode}
        />
      </main>
    </div>
  );
}
