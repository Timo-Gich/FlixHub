import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchTrendingAll,
  getBackdropUrl,
  fetchMediaImages,
  getLogoUrl,
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
  const [resettingTrack, setResettingTrack] = useState(false);
  const [paused, setPaused] = useState(false);
  const [brokenBackdrops, setBrokenBackdrops] = useState({});
  // Cache of the official TMDb title logo per slide:  URL or null when absent.
  const [titleLogos, setTitleLogos] = useState({});
  // Tracks per-slide logo fetch progress to avoid duplicate / refetch loops.
  const [logoStatus, setLogoStatus] = useState({});

  // Guard against a stale active index after a reload with fewer results.
  const safeActive = slideCount ? activeIndex % slideCount : 0;
  const trackIndex = activeIndex <= slideCount ? activeIndex : safeActive;
  const trackSlides = slideCount > 1 ? [...slides, slides[0]] : slides;

  // Give the track time to render its transition-free reset before enabling
  // transitions again, so the duplicate-to-first jump stays invisible.
  useEffect(() => {
    if (!resettingTrack) return undefined;
    let secondFrame;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => setResettingTrack(false));
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) cancelAnimationFrame(secondFrame);
    };
  }, [resettingTrack]);

  // Autoplay. Manual navigation changes activeIndex, which re-arms the timer
  // so it never flips immediately after a click.
  useEffect(() => {
    if (paused || slideCount < 2) return;
    const id = setInterval(
      () => setActiveIndex((i) => (i === slideCount - 1 ? slideCount : (i + 1) % slideCount)),
      ROTATE_MS,
    );
    return () => clearInterval(id);
  }, [paused, slideCount, safeActive]);

  const slideKey = (movie) => `${movie.media_type}-${movie.id}`;

  // Fetches the official TMDb title logo for one slide (movie or TV) and caches
  // the result. On failure it stores null so the text title stays as the
  // fallback without retrying on every render.
  const loadLogo = (movie) => {
    const key = slideKey(movie);
    if (titleLogos[key] !== undefined || logoStatus[key]) return;

    setLogoStatus((prev) => ({ ...prev, [key]: 'loading' }));
    fetchMediaImages(movie.media_type, movie.id)
      .then((images) => {
        const url = getLogoUrl(images?.logos);
        setTitleLogos((prev) => ({ ...prev, [key]: url }));
        setLogoStatus((prev) => ({ ...prev, [key]: url ? 'loaded' : 'error' }));
      })
      .catch(() => {
        setTitleLogos((prev) => ({ ...prev, [key]: null }));
        setLogoStatus((prev) => ({ ...prev, [key]: 'error' }));
      });
  };

  // Lazily load the active slide's logo (and prefetch the next) so the carousel
  // only makes an extra TMDb call for slides that are actually shown.
  useEffect(() => {
    if (!slideCount) return;
    const active = slides[safeActive];
    if (active) loadLogo(active);
    if (slideCount > 1) {
      const next = slides[(safeActive + 1) % slideCount];
      if (next) loadLogo(next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeActive, slideCount]);

  const markBackdropBroken = (id) => setBrokenBackdrops((prev) => ({ ...prev, [id]: true }));

  // Preload the active and next background so CSS background failures can use
  // the existing per-slide gradient fallback.
  useEffect(() => {
    if (!slideCount) return undefined;
    const indices = [safeActive, (safeActive + 1) % slideCount];
    const images = indices
      .map((index) => slides[index])
      .filter(Boolean)
      .map((movie) => {
        const url = getBackdropUrl(movie.backdrop_path, 1280);
        if (!url || brokenBackdrops[movie.id]) return null;
        const image = new Image();
        image.onerror = () => markBackdropBroken(movie.id);
        image.src = url;
        return image;
      })
      .filter(Boolean);

    return () => {
      images.forEach((image) => {
        image.onerror = null;
      });
    };
  }, [safeActive, slideCount, brokenBackdrops]);

  // If a cached logo image fails to decode/load, drop it and fall back to text.
  const markLogoBroken = (movie) => {
    setTitleLogos((prev) =>
      prev[slideKey(movie)] ? { ...prev, [slideKey(movie)]: null } : prev,
    );
  };

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
      className="relative h-[80vh] min-h-[540px] w-full overflow-hidden bg-ink lg:min-h-[620px]"
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

      {/* The active slide is translated into view; inactive slides cannot be interacted with. */}
      <div
        onTransitionEnd={(event) => {
          if (
            event.target === event.currentTarget &&
            event.propertyName === 'transform' &&
            trackIndex === slideCount
          ) {
            setResettingTrack(true);
            setActiveIndex(0);
          }
        }}
        className="flex h-full w-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{
          transform: `translate3d(-${trackIndex * 100}%, 0, 0)`,
          transition: resettingTrack ? 'none' : undefined,
        }}
      >
        {trackSlides.map((movie, i) => {
          const slideIndex = i === slideCount ? 0 : i;
          const isActive = i === trackIndex;
          const backdrop = brokenBackdrops[movie.id] ? null : getBackdropUrl(movie.backdrop_path, 1280);
          const rating = formatRating(movie.vote_average);
          const year = formatYear(movie.release_date ?? movie.first_air_date);
          const title = movie.title || movie.name || 'Untitled';
          const overview = movie.overview || '';
          const logoUrl = titleLogos[slideKey(movie)] || null;

          return (
            <article
              key={`${movie.media_type}-${movie.id}${i === slideCount ? '-clone' : ''}`}
              aria-hidden={!isActive}
              onClick={() => {
                if (isActive) navigate(watchUrl(movie));
              }}
              style={{ '--hero': backdrop ? `url("${backdrop}")` : undefined }}
              className={`relative h-full w-full shrink-0 overflow-hidden ${
                isActive ? 'cursor-pointer' : 'pointer-events-none'
              }`}
            >
              <div
                aria-hidden="true"
                style={backdrop ? { backgroundImage: 'var(--hero)' } : undefined}
                className={`absolute inset-0 bg-cover bg-center ${
                  backdrop ? '' : `bg-gradient-to-br ${gradients[slideIndex % gradients.length]}`
                }`}
              />

              {/* Depth + legibility overlays (gentle on the artwork, padded at the title) */}
              <div className="absolute inset-0 z-10 bg-gradient-to-r from-ink/40 via-ink/15 to-transparent" aria-hidden="true" />
              <div className="hero-vignette absolute inset-0 z-10 bg-gradient-to-t from-black via-black/60 to-transparent" aria-hidden="true" />
              <div className="absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-ink/40 to-transparent" aria-hidden="true" />
              <div className="absolute inset-0 z-10 bg-[radial-gradient(ellipse_at_center,transparent_60%,rgba(0,0,0,0.25)_100%)]" aria-hidden="true" />

              {/* Content — rendered for the active slide only */}
              {isActive && (
              <div className="absolute inset-x-0 bottom-0 z-20 mx-auto flex max-w-[1600px] flex-col gap-4
                               px-4 pb-8 sm:px-8 sm:pb-12">
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-brand/60
                                 bg-brand/10 px-3 py-1 text-xs font-semibold tracking-wide text-brand-light">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-light" aria-hidden="true" />
                  TRENDING NOW {slideIndex + 1} OF {slideCount}
                </span>

                <h1 className="max-w-3xl text-shadow-hero text-3xl font-black leading-tight text-white
                               sm:text-4xl lg:text-5xl">
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={title}
                      loading="eager"
                      onError={() => markLogoBroken(movie)}
                      className="inline-block max-h-14 w-auto max-w-full object-contain
                                 align-middle sm:max-h-20 lg:max-h-24"
                    />
                  ) : (
                    title
                  )}
                </h1>

                <p className="max-w-2xl font-sans text-shadow-hero line-clamp-2 text-sm leading-relaxed text-foreground/90 sm:text-base lg:text-lg">
                  {overview || 'No synopsis available for this title.'}
                </p>

                <div
                  aria-label="Title details"
                  className="flex flex-wrap items-center gap-2.5 font-display uppercase tracking-[0.16em]"
                >
                  {rating && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-black shadow-sm shadow-black/25">
                      <span aria-hidden="true">★</span>
                      <span>{rating}</span>
                    </span>
                  )}
                  {year && (
                    <>
                      {rating && <span className="text-white/45" aria-hidden="true">·</span>}
                      <span className="text-sm font-medium text-white/90">{year}</span>
                    </>
                  )}
                  {movie.original_language && (
                    <>
                      {(rating || year) && <span className="text-white/45" aria-hidden="true">·</span>}
                      <span className="text-xs font-medium text-white/65">{movie.original_language.toUpperCase()}</span>
                    </>
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
            </article>
          );
        })}
      </div>
    </section>
  );
}