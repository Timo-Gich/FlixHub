import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPosterUrl, formatRating, formatYear } from '../services/tmdbService';
import { subscribeLibrary, isSaved, toggleWatchLater } from '../services/libraryService';
import { gradients } from '../data/movies';

/**
 * A single movie tile fed from TMDb data.
 * Renders the real poster when available, otherwise a gradient placeholder.
 * Hovering reveals the overview and a play affordance. The whole card links to
 * the watch page for that movie.
 * Props:
 *   - movie        : a TMDb movie object (title, poster_path, vote_average, …)
 *   - index        : optional numeric rank shown in the corner
 *   - saved        : optional controlled saved-state. When provided, the
 *                    bookmark button calls onToggleSaved instead of writing to
 *                    localStorage directly.
 *   - onToggleSaved: (movie) => void
 *   - onRemove     : (movie) => void — when provided, shows a ✕ remove button
 *   - progress     : optional number 0..1 for a "Continue Watching" progress bar
 *   - to           : optional link override (e.g. a TV watch URL)
 *   - meta         : optional short label shown near the year (e.g. "S1 E2")
 */
export default function MovieCard({
  movie,
  index,
  saved,
  onToggleSaved,
  onRemove,
  progress,
  to,
  meta,
}) {
  const [hover, setHover] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const controlled = typeof saved === 'boolean';
  const [selfSaved, setSelfSaved] = useState(() =>
    controlled ? saved : movie?.id ? isSaved(movie.id) : false,
  );

  // Keep the bookmark state in sync with external changes (and our own writes).
  useEffect(() => {
    if (controlled) {
      setSelfSaved(!!saved);
      return;
    }
    if (!movie?.id) return;
    setSelfSaved(isSaved(movie.id));
    return subscribeLibrary(() => setSelfSaved(isSaved(movie.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled, saved, movie.id]);

  if (!movie) return null;

  const title = movie.title || movie.name || 'Untitled';
  const poster = imgFailed ? null : getPosterUrl(movie.poster_path);
  const rating = formatRating(movie.vote_average);
  const year = formatYear(movie.release_date ?? movie.first_air_date);
  const overview = movie.overview;
  const gradient = gradients[index % gradients.length];
  const savedState = controlled ? saved : selfSaved;
  // TV entries (from /tv endpoints) expose `name` instead of `title`.
  const isTV = movie.media_type === 'tv' || (movie.name && !movie.title);
  const linkTo = to ?? (isTV ? `/tv/${movie.id}` : `/watch/${movie.id}`);

  const handleBookmark = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (controlled) {
      onToggleSaved?.(movie);
    } else {
      setSelfSaved(toggleWatchLater(movie));
    }
  };

  return (
    <Link
      to={linkTo}
      aria-label={`Watch ${title}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group relative block aspect-[2/3] w-full overflow-hidden rounded-md
                 bg-ink-raised text-left shadow transition duration-200
                 hover:scale-[1.04] hover:shadow-2xl focus:outline-none
                 focus-visible:ring-2 focus-visible:ring-brand"
    >
      {/* Poster / fallback backdrop */}
      {poster ? (
        <img
          src={poster}
          alt={`${title} poster`}
          loading="lazy"
          decoding="async"
          onError={() => setImgFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition duration-200 ${
            hover ? 'scale-105 brightness-75' : ''
          }`}
        />
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradient} opacity-80`} aria-hidden="true" />
      )}

      {/* Card content */}
      <div className="relative flex h-full flex-col justify-end bg-gradient-to-t from-black/80 via-black/20 to-transparent p-3">
        {/* Bookmark (watch later) toggle — always available */}
        <button
          type="button"
          onClick={handleBookmark}
          aria-pressed={savedState}
          aria-label={savedState ? 'Remove from Watchlist' : 'Add to Watchlist'}
          title={savedState ? 'Remove from Watchlist' : 'Add to Watchlist'}
          className={`absolute left-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full
                       shadow transition hover:scale-105 ${
                         savedState ? 'bg-ink-raised text-brand ring-1 ring-brand/60' : 'bg-black/60 text-white'
                       }`}
        >
          <svg viewBox="0 0 24 24" className={`h-4 w-4 ${
            savedState ? 'fill-brand' : 'fill-none stroke-current'
          }`} strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 3h12v18l-6-4-6 4V3z" />
          </svg>
        </button>

        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove(movie);
            }}
            aria-label="Remove"
            title="Remove"
            className="absolute right-1 top-1 z-10 flex h-8 w-8 items-center justify-center rounded-full
                       bg-black/60 text-white/90 shadow transition hover:bg-brand"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6l-12 12" />
            </svg>
          </button>
        )}

        {!onRemove && typeof index === 'number' && (
          <span className="absolute right-2 top-2 text-4xl font-black text-white/30 drop-shadow">
            {index < 10 ? `0${index}` : index}
          </span>
        )}

        {rating && (
          <span className="mb-1 inline-flex w-fit items-center gap-1 rounded bg-black/50 px-1.5 py-0.5
                           text-[11px] font-bold text-amber-400">
            <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
              <path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.8 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z" />
            </svg>
            {rating}
          </span>
        )}

        <span className="text-shadow-hero text-sm font-semibold leading-tight text-white">
          {title}
        </span>
        <span className="mt-1 flex items-center gap-2">
          {meta && (
            <span className="rounded bg-brand/15 px-1.5 text-[11px] font-bold leading-none text-brand-light">
              {meta}
            </span>
          )}
          {year && <span className="text-xs text-foreground/70">{year}</span>}
          <span className="h-px flex-1 bg-gradient-to-r from-white/40 to-transparent" />
        </span>

        {typeof progress === 'number' && (
          <span
            className="mt-1 h-1 w-full overflow-hidden rounded-full bg-ink-border"
            aria-label={`${Math.round(Math.max(0, Math.min(progress, 1)) * 100)}% watched`}
          >
            <span
              className="block h-full rounded-full bg-brand"
              style={{ width: `${Math.max(0, Math.min(progress, 1)) * 100}%` }}
            />
          </span>
        )}

        {/* Hover overlay with overview + play */}
        <span
          className={`pointer-events-none absolute inset-0 flex flex-col items-stretch justify-end
                      bg-black/60 p-3 transition-opacity duration-200 ${
                        hover ? 'opacity-100' : 'opacity-0'
                      }`}
        >
          <span className="flex items-center gap-2">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand
                             shadow-lg shadow-brand/50 transition group-hover:scale-110"
                  aria-hidden="true">
              <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 fill-white" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
            {rating && (
              <span className="text-xs font-bold text-amber-400">★ {rating}</span>
            )}
          </span>
          {overview && (
            <span className="mt-2 line-clamp-4 text-xs leading-snug text-white/90">
              {overview}
            </span>
          )}
        </span>
      </div>
    </Link>
  );
}