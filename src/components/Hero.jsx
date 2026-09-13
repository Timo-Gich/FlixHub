import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchTrendingAll,
  getBackdropUrl,
  formatRating,
  formatYear,
} from '../services/tmdbService';
import { useMovieData } from '../hooks/useMovieData';
import { gradients } from '../data/movies';

const MAX_SLIDES = 10; // Number of trending titles in the carousel.
const ROTATE_MS = 10000; // Autoplay interval.

/**
 * Full-width, auto-rotating hero carousel backdropped by the top trending
 * movies from TMDb. Each slide shows its high-quality backdrop, title, a short
 * overview and a Play button. Rotates automatically and pauses on hover/focus.
 */
export default function Hero() {
  const { data, loading, error, reload } = useMovieData(fetchTrendingAll, []);

  const slides = (data?.results ?? []).slice(0, MAX_SLIDES);
  const slideCount = slides.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [brokenBackdrops, setBrokenBackdrops] = useState({});

  // Guard against a stale active index after a reload with fewer results.
  const safeActive = slideCount ? activeIndex % slideCount : 0;

  // Autoplay. Manual navigation changes activeIndex, which re-arms the timer
  // so it never flips immediately after a click.
  useEffect(() => {
    if (paused || slideCount < 2) return;
    const id = setInterval(() => setActiveIndex((i) => (i + 1) % slideCount), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused, slideCount, safeActive]);

  const markBackdropBroken = (id) => setBrokenBackdrops((prev) => ({ ...prev, [id]: true }));

  const navigate = useNavigate();
  const watchUrl = (movie) =>
    movie.media_type === 'tv' ? `/tv/${movie.id}` : `/watch/${movie.id}`;

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="Trending movie and TV highlights"
      aria-live="off"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className="relative w-full min-h-[540px] overflow-hidden bg-ink lg:min-h-[620px]"
    >
      {/* Loading skeleton */}
      {loading && (
        <div className="absolute inset-0 flex items-end px-4 py-8 sm:px-8">
          <div className="w-full max-w-2xl space-y-4 text-left">
            <div className="h-8 w-48 animate-pulse rounded bg-ink-raised" />
            <div className="h-14 w-3/4 animate-pulse rounded bg-ink-raised" />
            <div className="h-4 w-full animate-pulse rounded bg-ink-raised" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-ink-raised" />
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-xl text-center">
            <h1 className="text-3xl font-black text-white">Hero unavailable</h1>
            <p className="mt-3 text-sm text-foreground/80">{error.message}</p>
            <button
              type="button"
              onClick={reload}
              className="mt-5 rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white
                         transition hover:bg-brand-dark"
            >
              Try again
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && slideCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-sm text-muted">No featured titles right now.</p>
        </div>
      )}

      {/* Slides: every backdrop is rendered for a smooth crossfade, but only
          the active slide exposes its interactive content to assistive tech. */}
      {slides.map((movie, i) => {
        const isActive = i === safeActive;
        const backdrop = brokenBackdrops[movie.id] ? null : getBackdropUrl(movie.backdrop_path, 1280);
        const rating = formatRating(movie.vote_average);
        const year = formatYear(movie.release_date ?? movie.first_air_date);
        const title = movie.title || movie.name || 'Untitled';
        const overview = movie.overview || '';

        return (
          <div
            key={`${movie.media_type}-${movie.id}`}
            aria-hidden={!isActive}
            onClick={() => {
              if (isActive) navigate(watchUrl(movie));
            }}
            className={`absolute inset-0 transition-opacity duration-700 ${
              isActive ? 'cursor-pointer opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            {/* Backdrop or gradient fallback */}
            {backdrop ? (
              <img
                src={backdrop}
                alt=""
                aria-hidden="true"
                loading="lazy"
                onError={() => markBackdropBroken(movie.id)}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className={`h-full w-full bg-gradient-to-br ${gradients[i % gradients.length]}`} aria-hidden="true" />
            )}

            {/* Readability overlays */}
            <div className="absolute inset-0 z-10 bg-gradient-to-r from-ink via-ink/70 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 z-10 h-40 bg-gradient-to-t from-ink to-transparent" aria-hidden="true" />

            {/* Content — rendered for the active slide only */}
            {isActive && (
              <div className="absolute inset-x-0 bottom-0 z-20 mx-auto flex max-w-[1600px] flex-col gap-4
                               px-4 pb-8 sm:px-8 sm:pb-12">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand/60
                                 bg-brand/10 px-3 py-1 text-xs font-semibold tracking-wide text-brand-light">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-light" aria-hidden="true" />
                  TRENDING NOW {i + 1} OF {slideCount}
                </span>

                <h1 className="max-w-3xl text-shadow-hero text-3xl font-black leading-tight text-white
                               sm:text-4xl lg:text-5xl">
                  {title}
                </h1>

                <p className="max-w-2xl text-shadow-hero line-clamp-2 text-sm text-foreground/90 sm:text-base lg:text-lg">
                  {overview || 'No synopsis available for this title.'}
                </p>

                <div className="flex flex-wrap items-center gap-3">
                  {rating && (
                    <span className="w-fit rounded bg-black/50 px-2 py-0.5 text-xs font-bold text-amber-400">
                      ★ {rating} / 10
                    </span>
                  )}
                  {year && <span className="text-sm text-foreground/80">{year}</span>}
                  {movie.original_language && (
                    <span className="text-sm text-muted">· {movie.original_language.toUpperCase()}</span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(watchUrl(movie))}
                    className="rounded-md bg-brand px-7 py-3 text-sm font-bold text-white shadow-md
                               shadow-brand/40 transition hover:bg-brand-dark focus:outline-none
                               focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.98]"
                  >
                    ▶ Play
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-ink-raised/80 px-7 py-3 text-sm font-bold text-white ring-1
                               ring-white/15 transition hover:bg-ink-raised focus:outline-none
                               focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.98]"
                  >
                    More Info
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}