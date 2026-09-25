import { useEffect, useState, useRef } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import DetailHero from '../components/DetailHero';
import CastRow from '../components/CastRow';
import RecommendationsRow from '../components/RecommendationsRow';
import SeasonDropdown from '../components/SeasonDropdown';
import { useMovieData } from '../hooks/useMovieData';
import {
  fetchTVDetails,
  fetchTVSeason,
  getBackdropUrl,
  getPosterUrl,
  getImageUrl,
  formatRating,
  formatYear,
} from '../services/tmdbService';
import { saveLastSeason, getLastSeason, getWatchedEpisodes } from '../services/seasonMem';

/**
 * Small responsive thumbnail for an episode row. Shows the episode's still frame
 * (TMDb still_path) when available, gracefully falling back to a plain "E{n}"
 * block. When the episode is the highlighted one, a bright play button overlays
 * the thumb so the "next up" row is unmistakable.
 */
function EpisodeThumb({ stillPath, season, episodeNumber, highlighted }) {
  const [failed, setFailed] = useState(false);
  const imgUrl = !failed && stillPath ? getImageUrl(stillPath, 500) : null;
  return (
    <span
      className={`relative flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md ${
        highlighted ? 'ring-2 ring-brand' : 'ring-1 ring-ink-border'
      }`}
    >
      {imgUrl ? (
        <img
          src={imgUrl}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span className="absolute inset-0 flex h-full w-full items-center justify-center bg-brand/15" />
      )}
      {/* Season + episode — a single top-left label so each row is clearly
          distinct (S2 E3) whether or not a still frame is available. */}
      <span className="absolute left-1 top-1 flex rounded bg-black/60 px-1 text-[10px] font-bold leading-none text-white">
        {season != null && <>S{season} </>}E{episodeNumber}
      </span>
      {highlighted && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/45">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand shadow-lg shadow-brand/40">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 fill-white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </span>
      )}
    </span>
  );
}

/**
 * /tv/:id — VidBox-style series detail page. Uses the shared DetailHero (same
 * structure as movies) plus a cast row and a "Similar Shows" carousel, all from
 * a single call to fetchTVDetails (append_to_response=credits,recommendations).
 * A season selector + episode list let you open the TV player
 * (/watch/tv/:id/:season/:episode).
 */
export default function TVDetailPage() {
  const { id } = useParams();

  const { data: series, loading, error, reload } = useMovieData(() => fetchTVDetails(id), [id]);
  const seasons = (series?.seasons ?? []).filter((s) => s.season_number > 0 && s.episode_count > 0);

  // Optional deep-link params so the episode list can open on a specific season
  // and highlight a single episode. Two kinds of link land here:
  //   - Continue Watching → ?season=N&episode=M      → labels it "Resume"
  //   - Player "Back"     → ?season=N&episode=M&n=1  → labels it "Next up"
  const [searchParams] = useSearchParams();
  const linkSeason = searchParams.get('season');
  const linkEpisode = searchParams.get('episode');
  // `n=1` marks a link as pointing at the *next* episode to watch (auto-advanced
  // from the player), so we highlight it as "Next up" rather than "Resume".
  const isNextLink = searchParams.get('n') === '1';

  const [season, setSeason] = useState(null);
  useEffect(() => {
    if (series && season === null) {
      // 1) A deep-linked season (Continue Watching / player "next").
      const requested = linkSeason != null ? Number(linkSeason) : null;
      const match = requested != null ? seasons.find((s) => s.season_number === requested) : null;
      if (match) {
        setSeason(match.season_number);
        return;
      }
      // 2) The last season the user had selected for this series, so closing the
      //    player doesn't drop them back to Season 1.
      const remembered = getLastSeason(id);
      const rememberedMatch =
        remembered != null ? seasons.find((s) => s.season_number === remembered) : null;
      if (rememberedMatch) {
        setSeason(rememberedMatch.season_number);
        return;
      }
      // 3) Fall back to the first season.
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
  // Which episode (if any) to highlight on the currently selected season. Home's
  // Continue Watching passes a "resume" point; the player's Back button passes
  // the auto-advanced "next" episode so it's obvious what to play next.
  const linkEpisodeNum = linkEpisode != null ? Number(linkEpisode) : null;
  const showEpisodeHighlight = linkSeason != null && Number(linkSeason) === selectedSeason;

  // Episodes already watched for the currently selected season (checked off in
  // the list alongside the next-up / resume highlight).
  const watchedInSeason =
    (getWatchedEpisodes(id)[String(selectedSeason)] ?? []);

  // The auto-advanced "Next up" is the very last episode of the series when it
  // sits on the final season's last episode — show an "all caught up" state.
  const lastSeasonForFinale = seasons[seasons.length - 1];
  const isSeriesFinale =
    lastSeasonForFinale != null &&
    Number(linkSeason) === lastSeasonForFinale.season_number &&
    linkEpisodeNum === lastSeasonForFinale.episode_count;

  // When arriving via a deep link that highlights an episode, bring it into view
  // (the restored scroll position can otherwise leave it off-screen).
  const highlightRef = useRef(null);
  useEffect(() => {
    if (!showEpisodeHighlight || !highlightRef.current) return;
    const raf = requestAnimationFrame(() => {
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes, showEpisodeHighlight, linkEpisodeNum, selectedSeason]);

  const title = series?.name || 'Series';
  const rating = formatRating(series?.vote_average);
  const year = formatYear(series?.first_air_date);
  const numSeasons = series?.number_of_seasons;
  const meta = [
    year,
    numSeasons ? `${numSeasons} season${numSeasons === 1 ? '' : 's'}` : null,
  ].filter(Boolean);
  const backdrop = series?.backdrop_path ? getBackdropUrl(series.backdrop_path) : null;
  const poster = series?.poster_path ? getPosterUrl(series.poster_path, 500) : null;
  const genres = series?.genres ?? [];
  const overview = series?.overview;
  const hasValidId = id !== undefined && !Number.isNaN(Number(id));
  // Hero "Play" starts the first episode of the currently selected season (or
  // Season 1 before the season selector has initialised), so the hero stays in
  // sync with the episode list below it.
  const playSeason = selectedSeason ?? 1;
  const playHref = hasValidId ? `/watch/tv/${id}/${playSeason}/1` : null;

  return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main className="pb-12">
        {loading && <div aria-hidden="true" className="h-[480px] w-full animate-pulse bg-ink-raised" />}

        {error && (
          <div className="flex min-h-[60vh] items-center justify-center px-6">
            <div className="w-full max-w-xl rounded-md border border-brand/30 bg-brand/5 p-6 text-center">
              <h1 className="text-2xl font-black text-white">Series unavailable</h1>
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

        {series && !loading && !error && (
          <>
            <DetailHero
              backdropUrl={backdrop}
              posterUrl={poster}
              title={title}
              tagline={series.tagline}
              meta={meta}
              genres={genres}
              rating={rating}
              overview={overview}
              playHref={playHref}
            />
          </>
        )}

        {/* Episode picker */}
        {series && !loading && !error && (
          <section aria-label="Episodes" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-8">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-bold text-white">Episodes — Season {selectedSeason}</h2>
              <span className="inline-flex items-center gap-2.5 text-sm font-semibold uppercase tracking-wide text-muted">
                Season
                <SeasonDropdown
                  seasons={seasons}
                  value={selectedSeason}
                  onChange={(next) => {
                    setSeason(next);
                    // Remember it so reopening the page (e.g. from the player's
                    // Back button) returns to this season, not Season 1.
                    saveLastSeason(id, next);
                  }}
                />
              </span>
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
                {episodes.map((ep) => {
                  const isHighlighted = showEpisodeHighlight && ep.episode_number === linkEpisodeNum;
                  const isWatchedEp = watchedInSeason.includes(ep.episode_number);
                  return (
                    <li
                      key={ep.id}
                      ref={isHighlighted ? highlightRef : null}
                      className={`py-3 ${
                        isHighlighted ? 'rounded-md bg-brand/10 px-3 ring-2 ring-brand' : ''
                      }`}
                    >
                      <Link
                        to={`/watch/tv/${id}/${selectedSeason}/${ep.episode_number}`}
                        className="group flex gap-4 hover:bg-ink-raised"
                      >
                        <EpisodeThumb
                          stillPath={ep.still_path}
                          season={selectedSeason}
                          episodeNumber={ep.episode_number}
                          highlighted={isHighlighted}
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                            {ep.name || `Episode ${ep.episode_number}`}
                            {isHighlighted && (
                              isNextLink ? (
                                <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                  Next up
                                </span>
                              ) : (
                                <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                                  Resume
                                </span>
                              )
                            )}
                            {!isHighlighted && isWatchedEp && (
                              <span title="Watched" aria-label="Watched" className="font-bold text-brand-light">
                                ✓
                              </span>
                            )}
                          </span>
                          {isHighlighted && isNextLink && (
                            isSeriesFinale ? (
                              <span className="mt-1 text-xs font-bold text-brand-light">
                                🎉 You're all caught up — no next episode
                              </span>
                            ) : (
                              <span className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-brand-light">
                                <svg viewBox="0 0 24 24" className="h-3 w-3 fill-current" aria-hidden="true">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                                Play next episode
                              </span>
                            )
                          )}
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
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {series && !loading && !error && (
          <>
            <CastRow people={series.credits?.cast} />
            <RecommendationsRow title="Similar Shows" items={series.recommendations?.results} />
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}