import { useState } from 'react';
import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import MovieRow from '../components/MovieRow';
import MovieCard from '../components/MovieCard';
import Footer from '../components/Footer';
import { fetchTrendingMovies, fetchPopularMovies } from '../services/tmdbService';
import { getHistory } from '../services/libraryService';

const CONTINUE_LIMIT = 12;

/**
 * Home page: the fixed navbar, a full-width trending hero carousel, a
 * "Continue Watching" row (from watch history, newest first), a couple of
 * self-fetching content rows, and the footer.
 */
export default function HomePage() {
  // History is read on mount; navigation remounts this page so it refreshes.
  const [history] = useState(() => getHistory());
  // "Continue Watching" = history items that aren't finished, newest first.
  const FINISH_THRESHOLD = 0.98;
  const continueWatching = history
    .filter((entry) => {
      const dur = entry.durationSeconds || 0;
      if (dur > 0 && (entry.progressSeconds || 0) >= dur * FINISH_THRESHOLD) return false;
      return true;
    })
    .slice(0, CONTINUE_LIMIT);

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main>
        <Hero />

        {continueWatching.length > 0 && (
          <section aria-label="Continue Watching" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
            <h2 className="mb-4 text-lg font-bold text-white md:text-xl">Continue Watching</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {continueWatching.map((entry) => {
                const dur = entry.durationSeconds || 0;
                const progress = dur > 0 ? Math.min((entry.progressSeconds || 0) / dur, 1) : null;
                const meta = entry.type === 'tv' ? `S${entry.season} E${entry.episode}` : null;
                return (
                  <MovieCard
                    key={entry.movie.id}
                    movie={entry.movie}
                    progress={progress}
                    meta={meta}
                  />
                );
              })}
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