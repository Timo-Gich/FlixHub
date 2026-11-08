import MovieCard from './MovieCard';
import SectionHeading from './SectionHeading';
import { useMovieData } from '../hooks/useMovieData';
import { Link } from 'react-router-dom';

/**
 * A titled content row that fetches its own data via a TMDb service function.
 * Renders a responsive grid (2 → 6 columns) with graceful loading skeletons,
 * error retry and empty states.
 * Props:
 *   - title  : heading for the row
 *   - fetcher: async function returning a TMDb paged response ({ results })
 *   - movies : optional static list of movie objects (bypasses fetching)
 */
export default function MovieRow({ title, fetcher, movies: staticMovies, titleTo }) {
  const { data, loading, error, reload } = useMovieData(
    staticMovies ? () => Promise.resolve({ results: [] }) : fetcher,
    [title],
  );
  const items = Array.isArray(staticMovies) ? staticMovies : data?.results ?? [];
  const isLoading = staticMovies ? false : loading;
  const hasError = staticMovies ? null : error;

  return (
    <section aria-label={title} className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
      {titleTo ? (
        <Link to={titleTo} className="group/title inline-block">
          <SectionHeading className="mb-4 text-xl transition-colors group-hover/title:text-brand-light md:text-2xl">
            {title}
            <span className="ml-1 text-brand-light" aria-hidden="true">→</span>
          </SectionHeading>
        </Link>
      ) : (
        <SectionHeading className="mb-4 text-xl md:text-2xl">{title}</SectionHeading>
      )}

      {isLoading && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] animate-pulse rounded-md bg-ink-raised" />
          ))}
        </div>
      )}

      {hasError && (
        <div className="rounded-md border border-brand/30 bg-brand/5 px-4 py-6 text-center">
          <p className="mb-3 text-sm text-foreground/90">
            We couldn’t load “{title}”.
          </p>
          <p className="mx-auto mb-4 max-w-lg text-xs text-muted">{hasError.message}</p>
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

      {!isLoading && !hasError && (
        <>
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No titles to show yet.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {items.map((movie, i) => (
                <MovieCard key={`${title}-${movie.id ?? i}`} movie={movie} index={i + 1} />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}