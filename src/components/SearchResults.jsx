import { getPosterUrl, formatRating, formatYear } from '../services/tmdbService';

/**
 * A single search result row: small poster + title + year/rating. Clicking it
 * opens the movie's player.
 */
function ResultRow({ movie, onSelect }) {
  const poster = getPosterUrl(movie.poster_path);
  const year = formatYear(movie.release_date ?? movie.first_air_date);
  const rating = formatRating(movie.vote_average);
  const title = movie.title || movie.name || 'Untitled';
  const type = movie.media_type === 'tv' ? 'TV Show' : 'Movie';

  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect?.(movie)}
        className="group flex w-full gap-3 overflow-hidden rounded-md border border-ink-border
                   bg-ink-soft text-left transition hover:border-brand"
      >
        {poster ? (
          <img
            src={poster}
            alt={`${title} poster`}
            loading="lazy"
            className="h-20 w-14 shrink-0 object-cover bg-ink-raised"
            onError={(e) => {
              e.currentTarget.style.visibility = 'hidden';
            }}
          />
        ) : (
          <span className="flex h-20 w-14 shrink-0 items-center justify-center rounded-l-md bg-gradient-to-br from-brand/60 to-ink-raised" aria-hidden="true">
            <span className="text-xs font-black text-white/40">{title[0]?.toUpperCase() || '?'}</span>
          </span>
        )}
        <span className="flex min-w-0 flex-col justify-center pr-3">
          <span className="line-clamp-2 text-sm font-semibold text-foreground">{title}</span>
          <span className="mt-1 text-xs text-muted">
            {type}
            {year && `${year}`}
            {(year || rating) && ' · '}
            {rating && `★ ${rating}`}
          </span>
        </span>
      </button>
    </li>
  );
}

/**
 * Drop-down panel of live search results rendered directly beneath the navbar.
 * Handles loading, error, empty and populated states. Props:
 *   - query   : the submitted search term (used for messages/labels)
 *   - results : array of TMDb movie objects
 *   - loading : boolean
 *   - error   : Error | null
 *   - onSelect: (movie) => void — fired when a result is clicked
 *   - onClose : called to dismiss the panel
 */
export default function SearchResults({ query, results = [], loading, error, onSelect, onClose }) {
  return (
    <div className="border-b border-ink-border bg-ink/98 shadow-lg backdrop-blur">
      <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-8">
        {/* Header row */}
        <div className="mb-3 flex items-center justify-between gap-4">
          <p className="text-sm font-semibold text-white">
            {loading
              ? 'Searching…'
              : error
                ? 'Search problem'
                : results.length > 0
                  ? `Results for “${query}”`
                  : `No results for “${query}”`}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search results"
            className="rounded p-1 text-muted transition hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] animate-pulse rounded-md bg-ink-raised" />
            ))}
          </div>
        )}

        {error && <p className="py-4 text-sm text-muted">{error.message}</p>}

        {!loading && !error && results.length === 0 && (
          <p className="py-4 text-sm text-muted">
            We couldn’t find anything for “{query}”. Try a different title.
          </p>
        )}

        {!loading && !error && results.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {results.map((movie) => (
              <ResultRow key={`${movie.media_type}-${movie.id}`} movie={movie} onSelect={onSelect} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}