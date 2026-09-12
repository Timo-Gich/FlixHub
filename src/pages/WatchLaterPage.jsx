import { useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import MovieCard from '../components/MovieCard';
import { getWatchLater, removeFromWatchLater, toggleWatchLater } from '../services/libraryService';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently added' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title (A–Z)' },
  { value: 'year', label: 'Release year' },
  { value: 'rating', label: 'Rating' },
];

/**
 * /watch-later — a responsive grid of movies the user saved with the ✚/bookmark
 * button. Supports sorting, removing individual items, and an empty state.
 */
export default function WatchLaterPage() {
  const [items, setItems] = useState(() => getWatchLater());
  const [sort, setSort] = useState('recent');

  const sorted = [...items].sort((a, b) => {
    switch (sort) {
      case 'oldest':
        return a.savedAt - b.savedAt;
      case 'title':
        return (a.movie.title || '').localeCompare(b.movie.title || '');
      case 'year':
        return (b.movie.release_date || a.movie.release_date || '').localeCompare(
          a.movie.release_date || b.movie.release_date || '',
        );
      case 'rating':
        return (b.movie.vote_average || 0) - (a.movie.vote_average || 0);
      default:
        return b.savedAt - a.savedAt; // recently added
    }
  });

  const refresh = () => setItems(getWatchLater());

  const removeById = (id) => {
    removeFromWatchLater(id);
    refresh();
  };

  // Controlled toggle: the movie is already saved, so toggling removes it.
  const toggleOff = (movie) => {
    toggleWatchLater(movie);
    refresh();
  };

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main className="mx-auto w-full max-w-[1600px] px-4 pt-24 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-white">Watch Later</h1>
          <span className="w-fit rounded bg-ink-raised px-2 py-0.5 text-xs font-semibold text-muted">
            {items.length} saved
          </span>
        </div>

        {items.length > 0 && (
          <label className="mt-2 inline-flex items-center gap-2 text-sm text-muted">
            Sort by
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-md border border-ink-border bg-ink-raised px-3 py-1.5
                         text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/40"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}

        {items.length === 0 ? (
          <div className="mt-10 rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
            <p className="text-3xl font-black text-white">Nothing saved yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Tap the ✚ on any movie card to add it here so you can find it later.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block rounded-md bg-brand px-6 py-2.5 text-sm font-bold
                         text-white transition hover:bg-brand-dark"
            >
              Browse movies
            </Link>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {sorted.map(({ movie }) => (
              <MovieCard
                key={movie.id}
                movie={movie}
                saved
                onToggleSaved={toggleOff}
                onRemove={(m) => removeById(m.id)}
              />
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}