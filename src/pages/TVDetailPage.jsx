import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useMovieData } from '../hooks/useMovieData';
import {
  fetchTVDetails,
  fetchTVSeason,
  getBackdropUrl,
  formatRating,
  formatYear,
} from '../services/tmdbService';

/**
 * /tv/:id — series detail page. Shows the show's header, a season selector and
 * the episode list for the selected season. Clicking an episode opens the TV
 * player (/watch/tv/:id/:season/:episode).
 */
export default function TVDetailPage() {
  const { id } = useParams();

  const { data: series, loading, error, reload } = useMovieData(() => fetchTVDetails(id), [id]);
  const seasons = (series?.seasons ?? []).filter((s) => s.season_number > 0 && s.episode_count > 0);

  const [season, setSeason] = useState(null);
  useEffect(() => {
    if (series && season === null) {
      const first = seasons[0];
      if (first) setSeason(first.season_number);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, season]);

  const selectedSeason = season;
  const { data: seasonData, loading: seasonLoading, error: seasonError } = useMovieData(
    () => (selectedSeason != null ? fetchTVSeason(id, selectedSeason) : Promise.resolve({ episodes: [] })),
    [id, selectedSeason],
  );
  const episodes = seasonData?.episodes ?? [];

  const title = series?.name || 'Series';
  const rating = formatRating(series?.vote_average);
  const year = formatYear(series?.first_air_date);
  const backdrop = series?.backdrop_path ? getBackdropUrl(series.backdrop_path) : null;

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main className="pb-12">
        {/* Header */}
        <section className="relative overflow-hidden bg-gradient-to-br from-brand/40 via-ink-raised to-ink pb-10 pt-20">
          {backdrop && (
            <img src={backdrop} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-ink/70" aria-hidden="true" />
          <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/70 to-transparent" aria-hidden="true" />

          <div className="relative mx-auto flex max-w-[1600px] flex-col gap-4 px-4 sm:px-8">
            {loading && (
              <div className="space-y-4">
                <div className="h-10 w-3/4 animate-pulse rounded bg-ink-raised" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-ink-raised" />
              </div>
            )}

            {error && (
              <div className="rounded-md border border-brand/30 bg-brand/5 p-6 text-center">
                <h1 className="text-2xl font-black text-white">Series unavailable</h1>
                <p className="mt-2 text-sm text-muted">{error.message}</p>
                <button type="button" onClick={reload} className="mt-4 rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark">
                  Try again
                </button>
              </div>
            )}

            {series && !loading && !error && (
              <>
                <h1 className="text-shadow-hero text-4xl font-black text-white sm:text-5xl">{title}</h1>
                {series.tagline && <p className="text-lg italic text-foreground/80">{series.tagline}</p>}
                <p className="max-w-2xl text-shadow-hero line-clamp-4 text-sm text-foreground/90 sm:text-base">
                  {series.overview}
                </p>
                <div className="flex flex-wrap items-center gap-3 text-sm text-foreground/80">
                  {rating && (
                    <span className="w-fit rounded bg-black/50 px-2 py-0.5 text-xs font-bold text-amber-400">
                      ★ {rating} / 10
                    </span>
                  )}
                  {year && <span>{year}</span>}
                  {series.number_of_seasons && (
                    <span>· {series.number_of_seasons} season{series.number_of_seasons === 1 ? '' : 's'}</span>
                  )}
                  {series.original_language && <span>· {series.original_language.toUpperCase()}</span>}
                </div>
              </>
            )}
          </div>
        </section>

        {/* Link back to all series */}
        <div className="mx-auto w-full max-w-[1600px] px-4 py-4 sm:px-8">
          <Link
            to="/series"
            className="inline-flex w-fit items-center gap-2 rounded-md bg-ink-raised px-3 py-1.5 text-sm font-semibold text-white ring-1 ring-ink-border transition hover:bg-brand"
          >
            ← Back to Series
          </Link>
        </div>

        {/* Episode picker */}
        {series && !loading && !error && (
          <section aria-label="Episodes" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-white">Episodes — Season {selectedSeason}</h2>
              <label className="inline-flex items-center gap-2 text-sm text-muted">
                Season
                <select
                  value={selectedSeason ?? ''}
                  onChange={(e) => setSeason(Number(e.target.value))}
                  className="rounded-md border border-ink-border bg-ink-raised px-3 py-1.5
                             text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/40"
                >
                  {seasons.map((s) => (
                    <option key={s.season_number} value={s.season_number}>
                      Season {s.season_number} {s.episode_count ? `(${s.episode_count} eps)` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {seasonLoading && (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-md bg-ink-raised" />
                ))}
              </div>
            )}

            {seasonError && <p className="py-4 text-sm text-muted">{seasonError.message}</p>}

            {!seasonLoading && !seasonError && episodes.length === 0 && (
              <p className="py-4 text-sm text-muted">No episodes found for this season.</p>
            )}

            {!seasonLoading && !seasonError && episodes.length > 0 && (
              <ul className="mt-4 divide-y divide-ink-border">
                {episodes.map((ep) => (
                  <li key={ep.id} className="py-3">
                    <Link
                      to={`/watch/tv/${id}/${selectedSeason}/${ep.episode_number}`}
                      className="group flex gap-4 hover:bg-ink-raised"
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-brand/15 text-xs font-black text-brand-light">
                        E{ep.episode_number}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-sm font-semibold text-foreground">
                          {ep.name || `Episode ${ep.episode_number}`}
                        </span>
                        {ep.overview && (
                          <span className="mt-1 line-clamp-2 text-xs text-muted">{ep.overview}</span>
                        )}
                        {ep.air_date && <span className="mt-1 text-xs text-muted">{ep.air_date}</span>}
                      </span>
                      <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-muted group-hover:text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <path d="M9 5l6 3 4 3-4 3-6-8 6 11z" />
                      </svg>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}