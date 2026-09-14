import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getHistory, clearHistory, removeFromHistory, MAX_HISTORY } from '../services/libraryService';
import { getPosterUrl, formatYear } from '../services/tmdbService';

// Swipe-to-remove tuning.
const MAX_REVEAL = 96; // px the row slides left to reveal the action.
const SWIPE_THRESHOLD = 72; // px past which a swipe removes the item.

function dayLabel(ts) {
  const t = new Date(ts);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const diff = Math.round((startToday - start) / 86400000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return t.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function timeLabel(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * A single history row. On touch/mobile it supports swipe-left to remove;
 * desktop always shows an explicit ✕ button.
 */
function HistoryRow({ entry, onRemove }) {
  const movie = entry.movie;
  const poster = getPosterUrl(movie.poster_path);
  const year = formatYear(movie.release_date ?? movie.first_air_date);
  // Route to the matching detail page: TV shows to /tv/:id, movies to /movie/:id.
  const isTv = entry.type === 'tv' || movie.media_type === 'tv';
  const watchHref = isTv ? `/tv/${movie.id}` : `/movie/${movie.id}`;
  const [tx, setTx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef(null);
  const axisRef = useRef(null);

  const onStart = (x, y) => {
    startRef.current = { x, y };
    axisRef.current = null;
    setDragging(true);
  };

  const onMove = (x, y) => {
    if (!startRef.current) return;
    const dx = x - startRef.current.x;
    const dy = y - startRef.current.y;
    if (axisRef.current === null) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    // Vertical gesture → let the page scroll; horizontal → slide the row.
    if (axisRef.current === 'y') return;
    setTx(Math.min(0, Math.max(-MAX_REVEAL, dx)));
  };

  const onEnd = () => {
    startRef.current = null;
    axisRef.current = null;
    setDragging(false);
    if (tx < -SWIPE_THRESHOLD) {
      onRemove(entry.movie.id);
    } else {
      setTx(0);
    }
  };

  return (
    <li className="relative overflow-hidden">
      {/* Revealed action behind the row */}
      <button
        type="button"
        onClick={() => onRemove(entry.movie.id)}
        aria-label={`Remove ${movie.title}`}
        className="absolute inset-y-0 right-0 flex w-24 items-center justify-center
                   bg-brand text-sm font-bold text-white"
      >
        Remove
      </button>

      {/* Foreground row */}
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') e.preventDefault();
        }}
        onTouchStart={(e) => e.touches.length && onStart(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchMove={(e) => e.touches.length && onMove(e.touches[0].clientX, e.touches[0].clientY)}
        onTouchEnd={onEnd}
        onTouchCancel={() => {
          setTx(0);
          setDragging(false);
          startRef.current = null;
          axisRef.current = null;
        }}
        onPointerDown={(e) => e.pointerType === 'touch' && onStart(e.clientX, e.clientY)}
        onPointerMove={(e) => e.pointerType === 'touch' && onMove(e.clientX, e.clientY)}
        onPointerUp={(e) => e.pointerType === 'touch' && onEnd()}
        className="relative flex w-full items-center gap-3 rounded-md border border-ink-border
                   bg-ink-soft px-3 py-3 [touch-action:pan-y]"
        style={{ transform: `translateX(${tx}px)`, transition: dragging ? 'none' : 'transform 0.2s ease-out' }}
      >
        <Link
          to={watchHref}
          className="flex shrink-0 items-center rounded-md ring-1 ring-ink-border transition ring-brand/0 hover:ring-brand"
          aria-label={`Watch ${movie.title}`}
        >
          {poster ? (
            <img src={poster} alt="" loading="lazy" className="h-16 w-11 rounded-sm object-cover bg-ink-raised" />
          ) : (
            <span className="flex h-16 w-11 items-center justify-center rounded-sm bg-gradient-to-br from-brand/60 to-ink-raised">
              <span className="text-sm font-black text-white/50">{movie.title?.[0]?.toUpperCase() || '?'}</span>
            </span>
          )}
        </Link>

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-1 text-sm font-semibold text-foreground">{movie.title}</span>
          <span className="mt-0.5 text-xs text-muted">
            {[year, timeLabel(entry.watchedAt)].filter(Boolean).join(' · ')}
          </span>
        </span>

        <button
          type="button"
          onClick={() => onRemove(entry.movie.id)}
          aria-label={`Remove ${movie.title}`}
          title="Remove"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full
                     bg-black/50 text-white/90 transition hover:bg-brand"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6l-12 12" />
          </svg>
        </button>
      </div>
    </li>
  );
}

/**
 * /history — watch history grouped by day, with clear-all, remove-individual
 * (swipe on touch / ✕ on desktop), and an auto-cap that trims the oldest.
 */
export default function HistoryPage() {
  const [items, setItems] = useState(() => getHistory());

  const refresh = () => setItems(getHistory());
  const removeById = (id) => {
    removeFromHistory(id);
    refresh();
  };

  const handleClear = () => {
    if (window.confirm('Clear your entire watch history?')) {
      clearHistory();
      refresh();
    }
  };

  // Group by day label, preserving newest-first order.
  const groups = [];
  const seen = new Set();
  for (const entry of items) {
    const key = dayLabel(entry.watchedAt);
    if (!seen.has(key)) {
      seen.add(key);
      groups.push({ key, entries: [] });
    }
    groups[groups.length - 1].entries.push(entry);
  }

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main className="mx-auto w-full max-w-[1600px] px-4 pt-24 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-black text-white">Watch History</h1>
          <span className="w-fit rounded bg-ink-raised px-2 py-0.5 text-xs font-semibold text-muted">
            {items.length} watched
          </span>
          {items.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md bg-ink-raised px-4 py-1.5 text-sm font-semibold text-white
                         ring-1 ring-ink-border transition hover:bg-brand"
            >
              Clear history
            </button>
          )}
        </div>

        {items.length >= MAX_HISTORY && (
          <p className="mt-1 text-xs text-muted">
            History is capped at the most recent {MAX_HISTORY}; the oldest entries are trimmed automatically.
          </p>
        )}

        {items.length === 0 ? (
          <div className="mt-10 rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
            <p className="text-3xl font-black text-white">No watch history yet</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted">
              Movies you play will show up here, grouped by day.
            </p>
            <Link
              to="/"
              className="mt-6 inline-block rounded-md bg-brand px-6 py-2.5 text-sm font-bold
                         text-white transition hover:bg-brand-dark"
            >
              Start watching
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.key}>
                <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{group.key}</h2>
                <ul className="space-y-2">
                  {group.entries.map((entry) => (
                    <HistoryRow key={entry.movie.id} entry={entry} onRemove={removeById} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}