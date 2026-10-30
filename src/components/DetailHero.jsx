import { Link } from 'react-router-dom';
import BookmarkButton from './BookmarkButton';

/**
 * Shared VidBox-style hero header for movie and TV detail pages.
 * Full-width backdrop with dark gradient overlays, plus a poster, title,
 * tagline, rating badge, a meta line (year · runtime / seasons), genre chips,
 * overview and a primary red Play button.
 *
 * Props:
 *   - backdropUrl : widescreen TMDb backdrop URL (or null)
 *   - posterUrl   : portrait TMDb poster URL (or null)
 *   - title       : display title
 *   - tagline     : optional tagline
 *   - meta        : array of short meta strings, joined with "·" (e.g. year, runtime)
 *   - genres      : TMDb genre objects [{ id, name }]
 *   - rating      : formatted rating string (e.g. "8.5") or null
 *   - overview    : synopsis text
 *   - playHref    : route the red Play button links to (e.g. /watch/:id)
 *   - watchlistMovie : optional TMDb movie to show a Watchlist button for
 */
export default function DetailHero({
  backdropUrl,
  posterUrl,
  title,
  tagline,
  meta = [],
  genres = [],
  rating,
  overview,
  playHref,
  watchlistMovie,
}) {
  return (
    <section className="relative overflow-hidden bg-ink pt-20 sm:pt-24">
      {/* Full-width backdrop with dark gradient overlay */}
      {backdropUrl && (
        <img
          src={backdropUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/85 to-ink/50" aria-hidden="true" />
      <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-transparent" aria-hidden="true" />

      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-6 px-4 pb-10 sm:px-8 md:flex-row md:items-end md:gap-10">
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={`${title} poster`}
            className="mx-auto w-48 shrink-0 rounded-lg shadow-2xl ring-1 ring-white/10 md:mx-0 md:w-64"
          />
        ) : (
          <div
            className="mx-auto flex h-72 w-48 shrink-0 items-center justify-center rounded-lg bg-ink-raised ring-1 ring-white/10 md:mx-0 md:h-96 md:w-64"
            aria-hidden="true"
          >
            <span className="text-5xl font-black text-white/20">{title?.[0]?.toUpperCase() || '?'}</span>
          </div>
        )}

        <div className="max-w-3xl text-center md:text-left">
          {rating && (
            <span className="inline-flex w-fit items-center gap-1 rounded bg-black/50 px-2 py-0.5 text-xs font-bold text-amber-400">
              ★ {rating} / 10
            </span>
          )}

          <h1 className="text-shadow-hero mt-2 text-4xl font-black leading-tight text-white sm:text-5xl">
            {title}
          </h1>

          {tagline && <p className="mt-2 text-base italic text-foreground/80">{tagline}</p>}

          {meta.length > 0 && (
            <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-foreground/85 md:justify-start">
              {meta.map((part, i) => (
                <span key={i} className="inline-flex items-center gap-2">
                  {i > 0 && <span className="text-muted">·</span>}
                  {part}
                </span>
              ))}
            </p>
          )}

          {genres.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2 md:justify-start">
              {genres.map((g) => (
                <span
                  key={g.id}
                  className="rounded border border-ink-border bg-ink-raised/80 px-2.5 py-1 text-xs font-semibold text-foreground/90"
                >
                  {g.name}
                </span>
              ))}
            </div>
          )}

          {overview && (
            <p className="text-shadow-hero mx-auto mt-5 max-w-2xl text-sm leading-6 text-foreground/90 sm:text-base sm:leading-7 md:mx-0">
              {overview}
            </p>
          )}

          {(playHref || watchlistMovie) && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 md:justify-start">
              {playHref && (
                <Link
                  to={playHref}
                  className="inline-flex items-center gap-2 rounded-md bg-brand px-8 py-3 text-base font-bold text-white
                             shadow-md shadow-brand/40 transition hover:bg-brand-dark focus:outline-none
                             focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.98]"
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play
                </Link>
              )}
              {watchlistMovie && <BookmarkButton movie={watchlistMovie} variant="detail" />}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}