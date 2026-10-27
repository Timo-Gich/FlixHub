import { useEffect, useState } from 'react';
import { useLibrary } from '../hooks/useLibrary.jsx';

/**
 * Compact Watchlist (bookmark) toggle for search rows.
 *
 * Mirrors MovieCard's bookmark behaviour: reads the saved state, toggles via
 * the cloud-aware library hook, and stays in sync with library changes. Hidden
 * for IMDb-only results (the app only keeps TMDb titles in the watchlist) and
 * items with no id.
 *
 * Props:
 *   - movie : a TMDb / IMDb search result object
 */
export default function BookmarkButton({ movie }) {
  const { isSaved, toggleSaved } = useLibrary();
  const [saved, setSaved] = useState(() => (movie?.id ? isSaved(movie.id) : false));

  useEffect(() => {
    if (!movie?.id) return;
    setSaved(isSaved(movie.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie?.id, isSaved]);

  if (!movie?.id || movie.source === 'imdb') return null;

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleSaved(movie).then((next) => setSaved(next));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from Watchlist' : 'Add to Watchlist'}
      title={saved ? 'Remove from Watchlist' : 'Add to Watchlist'}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:scale-105 ${
        saved ? 'bg-ink-raised text-brand ring-1 ring-brand/60' : 'bg-black/60 text-white'
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`h-4 w-4 ${saved ? 'fill-brand' : 'fill-none stroke-current'}`}
        strokeWidth="2"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3h12v18l-6-4-6 4V3z" />
      </svg>
    </button>
  );
}
