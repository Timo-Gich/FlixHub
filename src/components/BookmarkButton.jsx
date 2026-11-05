import { useEffect, useState } from 'react';
import { useLibrary } from '../hooks/useLibrary.jsx';
import CollectionPicker from './CollectionPicker';

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
export default function BookmarkButton({ movie, variant = 'compact' }) {
  const { isSaved, toggleSaved, collections, saveToCollection, createCollection } = useLibrary();
  const [saved, setSaved] = useState(() => (movie?.id ? isSaved(movie.id) : false));
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    if (!movie?.id) return;
    setSaved(isSaved(movie.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie?.id, isSaved]);

  if (!movie?.id || movie.source === 'imdb') return null;

  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (saved) {
      toggleSaved(movie).then((next) => setSaved(next));
    } else {
      setPickerOpen(true);
    }
  };
  const prominent = variant === 'detail';

  return (
    <>
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={saved ? 'Remove from Watchlist' : 'Add to Watchlist'}
      title={saved ? 'Remove from Watchlist' : 'Add to Watchlist'}
      className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-bold transition
        focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.98] ${
          prominent
            ? `px-5 py-3 text-base ${
                saved
                  ? 'bg-ink-raised text-brand ring-1 ring-brand/60 hover:bg-ink-soft'
                  : 'border border-white/30 bg-black/50 text-white hover:bg-white/10'
              }`
            : `h-8 w-8 rounded-full hover:scale-105 ${
                saved ? 'bg-ink-raised text-brand ring-1 ring-brand/60' : 'bg-black/60 text-white'
              }`
        }`}
    >
      <svg
        viewBox="0 0 24 24"
        className={`${prominent ? 'h-5 w-5' : 'h-4 w-4'} ${
          saved ? 'fill-brand' : 'fill-none stroke-current'
        }`}
        strokeWidth="2"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 3h12v18l-6-4-6 4V3z" />
      </svg>
      {prominent && (saved ? 'In Watchlist' : 'Add to Watchlist')}
    </button>
    <CollectionPicker
      open={pickerOpen}
      collections={collections}
      movieTitle={movie.title || movie.name}
      onClose={() => setPickerOpen(false)}
      onCreate={createCollection}
      onChoose={async (collectionId) => {
        const succeeded = await saveToCollection(movie, collectionId);
        if (succeeded) setSaved(true);
        return succeeded;
      }}
    />
    </>
  );
}
