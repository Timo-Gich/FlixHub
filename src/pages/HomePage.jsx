import { useState, useEffect, useRef, useCallback } from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import MovieRow from '../components/MovieRow';
import MovieCard from '../components/MovieCard';
import SectionHeading from '../components/SectionHeading';
import Footer from '../components/Footer';
import { fetchTrendingMovies, fetchPopularMovies } from '../services/tmdbService';
import { FINISH_THRESHOLD, latestHistoryByTitle } from '../services/libraryService';
import { useLibrary } from '../hooks/useLibrary.jsx';

/**
 * Home page: the fixed navbar, a full-width trending hero carousel, a
 * "Continue Watching" row (from watch history — unfinished first, then
 * finished titles, so nothing is ever hidden), a couple of self-fetching
 * content rows, and the footer.
 */
export default function HomePage() {
  // Cloud-aware history (falls back to localStorage for guests).
  const { history } = useLibrary();

  // A title counts as "finished" once progress reaches 98% of its duration.
  const isFinished = (entry) => {
    const dur = entry.durationSeconds || 0;
    return dur > 0 && (entry.progressSeconds || 0) >= dur * FINISH_THRESHOLD;
  };

  // "Continue Watching" shows the latest entry per title, with in-progress
  // titles first. Cloud rows with a missing snapshot are skipped.
  const latestHistory = latestHistoryByTitle(history);
  const continueWatching = [
    ...latestHistory.filter((entry) => !isFinished(entry)),
    ...latestHistory.filter(isFinished),
  ];

  // Desktop scroll arrows for the Continue Watching row: they only appear when
  // there is actually something to scroll in their direction, and update as the
  // row scrolls or the window is resized.
  const rowRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollArrows = useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    // Small epsilon so the arrow disappears once truly at the end.
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollArrows();
    window.addEventListener('resize', updateScrollArrows);
    return () => window.removeEventListener('resize', updateScrollArrows);
  }, [updateScrollArrows]);

  const scrollRow = (direction) => {
    const el = rowRef.current;
    if (!el) return;
    // Scroll roughly one "page" of cards so each click advances noticeably.
    const step = el.clientWidth * 0.8;
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main>
        <Hero />

        {continueWatching.length > 0 && (
          <section aria-label="Continue Watching" className="group/continue-watching mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
            <SectionHeading className="mb-4 text-xl md:text-2xl">Continue Watching</SectionHeading>
            <div className="relative">
              <div
                ref={rowRef}
                onScroll={updateScrollArrows}
                className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 py-8 sm:-mx-8 sm:px-8"
              >
                {continueWatching.map((entry) => {
                  const dur = entry.durationSeconds || 0;
                  const progress = dur > 0 ? Math.min((entry.progressSeconds || 0) / dur, 1) : null;
                  const isTv = entry.type === 'tv';
                  const meta = isTv ? `S${entry.season} E${entry.episode}` : null;
                  // Resume by deep-linking to the detail page at the exact season
                  // and episode the user left off on (movies just go to /movie/:id).
                  const resumeTo =
                    isTv && entry.season != null
                      ? `/tv/${entry.movie.id}?season=${entry.season}${entry.episode != null ? `&episode=${entry.episode}` : ''}`
                      : undefined;
                  return (
                    <div key={`${entry.type || entry.movie.media_type || 'movie'}-${entry.movie.id}`} className="w-[150px] shrink-0 snap-start sm:w-[180px]">
                      <MovieCard
                        movie={entry.movie}
                        progress={progress}
                        to={resumeTo}
                        meta={meta}
                      />
                    </div>
                  );
                })}
              </div>

              {canScrollLeft && (
                <button
                  type="button"
                  onClick={() => scrollRow(-1)}
                  aria-label="Scroll Continue Watching row left"
                  title="Scroll left"
                  className="pointer-events-none absolute left-0 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center
                             rounded-full border border-ink-border bg-ink-raised/90 text-white opacity-0 shadow transition
                             group-hover/continue-watching:pointer-events-auto group-hover/continue-watching:opacity-100 hover:bg-brand md:flex"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                       strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
              )}

              {canScrollRight && (
                <button
                  type="button"
                  onClick={() => scrollRow(1)}
                  aria-label="Scroll Continue Watching row right"
                  title="Scroll right"
                  className="pointer-events-none absolute right-0 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center
                             rounded-full border border-ink-border bg-ink-raised/90 text-white opacity-0 shadow transition
                             group-hover/continue-watching:pointer-events-auto group-hover/continue-watching:opacity-100 hover:bg-brand md:flex"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                       strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </button>
              )}
            </div>
          </section>
        )}

        <MovieRow title="Trending Now" fetcher={() => fetchTrendingMovies()} />
        <MovieRow title="Popular on FlixHub" fetcher={() => fetchPopularMovies()} />
      </main>

      <Footer />
    </div>
  );
}
