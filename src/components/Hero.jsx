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

// Map TMDb genres to a display "tone" so each hero title's type echoes its content.
const GENRE_TONES = {
  heavy: {
    ids: [28, 12, 80, 53, 10752, 37], // Action, Adventure, Crime, Thriller, War, Western
    cls: 'font-display-black uppercase leading-[0.92] tracking-tight',
  },
  condensed: {
    ids: [878, 14, 9648, 27], // Sci-Fi, Fantasy, Mystery, Horror
    cls: 'font-display-condensed uppercase leading-[0.9] tracking-[0.04em]',
  },
  serif: {
    ids: [18, 10749, 36, 10402, 99, 10770], // Drama, Romance, History, Music, Documentary, TV Movie
    cls: 'font-display-serif italic tracking-tight leading-[0.98]',
  },
  playful: {
    ids: [16, 35, 10751], // Animation, Comedy, Family
    cls: 'font-display-playful uppercase leading-[0.95] tracking-tight',
  },
};
const toneFor = (movie) => {
  const ids = movie?.genre_ids || [];
  for (const group of Object.values(GENRE_TONES)) {
    if (ids.some((gid) => group.ids.includes(gid))) return group.cls;
  }
  return GENRE_TONES.heavy.cls;
};

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
    movie.media_type === 'tv' ? `/tv/${movie.id}` : `/movie/${movie.id}`;

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
        const toneClass = toneFor(movie);

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
                className={`h-full w-full object-cover will-change-transform ${
                  isActive ? 'animate-[kenburns_22s_ease-out_forwards]' : ''
                }`}
              />
            ) : (
              <div className={`h-full w-full bg-gradient-to-br ${gradients[i % gradients.length]}`} aria-hidden="true" />
            )}

            {/* Depth + legibility overlays (gentle on the artwork, padded at the title) */}
            <div className="absolute inset-0 z-10 bg-gradient-to-r from-ink/55 via-ink/25 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 bottom-0 z-10 h-[62%] bg-gradient-to-t from-ink via-ink/35 to-transparent" aria-hidden="true" />
            <div className="absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-ink/70 to-transparent" aria-hidden="true" />
            <div className="absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.4)_100%)]" aria-hidden="true" />

            {/* Content — rendered for the active slide only */}
            {isActive && (
              <div className="absolute inset-x-0 bottom-0 z-20 mx-auto flex max-w-[1600px] flex-col gap-3
                               px-4 pb-8 sm:px-8 sm:pb-12 animate-[rise_0.55s_ease-out_both]">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-white/25
                                 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase
                                 tracking-[0.18em] text-white backdrop-blur-sm">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-light" aria-hidden="true" />
                  Trending now · {i + 1} of {slideCount}
                </span>

                <span className="mt-1 h-1 w-16 rounded-full bg-gradient-to-r from-brand-light to-brand-dark/30"
                      aria-hidden="true" />

                <h1
                  className={`text-shadow-hero max-w-4xl text-[clamp(2.25rem,7vw,5.25rem)] text-white ${toneClass}`}
                >
                  {title}
                </h1>

                <p className="max-w-2xl text-shadow-hero line-clamp-2 pt-1 text-sm font-normal normal-case
                             tracking-normal text-white/90 sm:pt-2 sm:text-base lg:text-lg">
                  {overview || 'No synopsis available for this title.'}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                  {rating && (
                    <span className="inline-flex w-fit items-center gap-1.5 rounded bg-black/40 px-2 py-1
                                     text-xs font-bold text-amber-300">
                      <span className="text-sm leading-none">★</span> {rating} / 10
                    </span>
                  )}
                  {year && <span className="text-sm font-semibold text-white">{year}</span>}
                  {movie.original_language && (
                    <span className="text-sm text-white/70">· {movie.original_language.toUpperCase()}</span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate(watchUrl(movie))}
                    className="rounded-full bg-brand px-8 py-3 text-sm font-bold text-white shadow-lg
                               shadow-black/30 transition hover:bg-brand-dark focus:outline-none
                               focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.98]"
                  >
                    <span className="mr-1.5">▶</span> Play now
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-white/10 px-8 py-3 text-sm font-bold text-white ring-1
                               ring-white/25 backdrop-blur-sm transition hover:bg-white/20 focus:outline-none
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