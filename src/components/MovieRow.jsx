import MovieCard from './MovieCard';
import { useMovieData } from '../hooks/useMovieData';

/**
 * A titled content row that fetches its own data via a TMDb service function.
 * Renders a responsive grid (2 → 6 columns) with graceful loading skeletons,
 * error retry and empty states.
 * Props:
 *   - title  : heading for the row
 *   - fetcher: async function returning a TMDb paged response ({ results })
 */
export default function MovieRow({ title, fetcher }) {
  const { data, loading, error, reload } = useMovieData(fetcher, [title]);
  const movies = data?.results ?? [];

  return (
    <section aria-label={title} className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
      <h2 className="mb-4 text-lg font-bold text-white md:text-xl">{title}</h2>

      {loading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-md bg-ink-raised" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-brand/30 bg-brand/5 px-4 py-6 text-center">
          <p className="mb-3 text-sm text-foreground/90">
            We couldn’t load “{title}”.
          </p>
          <p className="mx-auto mb-4 max-w-lg text-xs text-muted">{error.message}</p>
          <button
            type="button"
            onClick={reload}
            className="rounded-md bg-brand px-5 py-2 text-sm font-bold text-white transition
                       hover:bg-brand-dark"
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && (
        <>
          {movies.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No titles to show yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {movies.map((movie, i) => (
                <MovieCard key={`${title}-${movie.id ?? i}`} movie={movie} index={i + 1} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}