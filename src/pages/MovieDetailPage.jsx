import { useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import DetailHero from '../components/DetailHero';
import CastRow from '../components/CastRow';
import RecommendationsRow from '../components/RecommendationsRow';
import { useMovieData } from '../hooks/useMovieData';
import {
  fetchMovieDetails,
  getBackdropUrl,
  getPosterUrl,
  formatRating,
  formatYear,
  formatRuntime,
} from '../services/tmdbService';

/**
 * /movie/:id — VidBox-style movie detail page.
 * All detail data (header, cast, recommendations) is fetched in a single TMDb
 * call via fetchMovieDetails, which uses append_to_response=credits,recommendations.
 * The red Play button links to the player at /watch/:id.
 */
export default function MovieDetailPage() {
  const { id } = useParams();
  const { data: movie, loading, error, reload } = useMovieData(() => fetchMovieDetails(id), [id]);

  const title = movie?.title || 'Movie';
  const rating = formatRating(movie?.vote_average);
  const year = formatYear(movie?.release_date);
  const runtime = formatRuntime(movie?.runtime);
  const meta = [year, runtime].filter(Boolean);
  const backdrop = movie?.backdrop_path ? getBackdropUrl(movie.backdrop_path) : null;
  const poster = movie?.poster_path ? getPosterUrl(movie.poster_path, 500) : null;
  const genres = movie?.genres ?? [];
  const overview = movie?.overview;
  const hasValidId = id !== undefined && !Number.isNaN(Number(id));
  const playHref = hasValidId ? `/watch/${id}` : null;

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main>
        {loading && (
          <div aria-hidden="true" className="h-[480px] w-full animate-pulse bg-ink-raised" />
        )}

        {error && (
          <div className="flex min-h-[70vh] items-center justify-center px-6">
            <div className="w-full max-w-xl rounded-md border border-brand/30 bg-brand/5 p-6 text-center">
              <h1 className="text-2xl font-black text-white">Movie unavailable</h1>
              <p className="mt-2 text-sm text-muted">{error.message}</p>
              <button
                type="button"
                onClick={reload}
                className="mt-4 rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {movie && !loading && !error && (
          <>
            <DetailHero
              backdropUrl={backdrop}
              posterUrl={poster}
              title={title}
              tagline={movie.tagline}
              meta={meta}
              genres={genres}
              rating={rating}
              overview={overview}
              playHref={playHref}
            />

            <CastRow people={movie.credits?.cast} />
            <RecommendationsRow title="Similar Movies" items={movie.recommendations?.results} />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}