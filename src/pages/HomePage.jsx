import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import MovieRow from '../components/MovieRow';
import MovieCard from '../components/MovieCard';
import HorizontalScrollRail from '../components/HorizontalScrollRail';
import SectionHeading from '../components/SectionHeading';
import Footer from '../components/Footer';
import { fetchTrendingMovies, fetchPopularMovies, discoverTitles } from '../services/tmdbService';
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

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main>
        <Hero />

        {continueWatching.length > 0 && (
          <section aria-label="Continue Watching" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
            <SectionHeading className="mb-4 text-xl md:text-2xl">Continue Watching</SectionHeading>
            <HorizontalScrollRail
              label="Continue Watching"
              contentLength={continueWatching.length}
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
            </HorizontalScrollRail>
          </section>
        )}

        <MovieRow title="Trending Now" fetcher={() => fetchTrendingMovies()} />
        <MovieRow title="Popular on FlixHub" fetcher={() => fetchPopularMovies()} />
        <MovieRow
          title="Explore Korean Cinema"
          titleTo="/discover?language=ko"
          fetcher={() => discoverTitles('movie', { with_original_language: 'ko' })}
        />
      </main>

      <Footer />
    </div>
  );
}
