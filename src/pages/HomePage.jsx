import Navbar from '../components/Navbar';
import Hero from '../components/Hero';
import MovieRow from '../components/MovieRow';
import Footer from '../components/Footer';
import { fetchTrendingMovies, fetchPopularMovies } from '../services/tmdbService';

/**
 * Home page: the fixed navbar, a full-width trending hero carousel, a couple of
 * self-fetching content rows, and the footer. All async work flows through
 * tmdbService with loading / error states handled in each component.
 */
export default function HomePage() {
  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main>
        <Hero />

        <MovieRow title="Trending Now" fetcher={() => fetchTrendingMovies()} />
        <MovieRow title="Popular on FlixHub" fetcher={() => fetchPopularMovies()} />
      </main>

      <Footer />
    </div>
  );
}