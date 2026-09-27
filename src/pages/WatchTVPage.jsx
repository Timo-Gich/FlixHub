import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import VideoPlayer from '../components/VideoPlayer';
import { fetchTVDetails } from '../services/tmdbService';
import { useMovieData } from '../hooks/useMovieData';
import { logPlayed, updateWatchProgress, FINISH_THRESHOLD } from '../services/libraryService';
import { saveLastSeason, markEpisodeWatched } from '../services/seasonMem';

// Only treat an episode as "started" after this much real watch time (in
// seconds). Opening an episode (or tapping Next to peek) must not move the
// resume point / watched marker before the viewer actually watches it.
const LOG_BEFORE_LOG = 10;

/**
 * /watch/tv/:id/:season/:episode - TV player with a server selector.
 * Back goes to the series detail page; plays are logged to history with
 * season/episode so Continue Watching can show the last watched episode.
 */
export default function WatchTVPage() {
  const { id, season, episode } = useParams();
  const hasValidId =
    id !== undefined &&
    !Number.isNaN(Number(id)) &&
    season !== undefined &&
    !Number.isNaN(Number(season)) &&
    episode !== undefined &&
    !Number.isNaN(Number(episode));

  const { data: details, loading: detailsLoading } = useMovieData(
    () => fetchTVDetails(id),
    [id],
  );

  // Which episode this player instance represents, so history/progress writes are
  // scoped to it and can never leak onto another episode of the same series.
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);

  // Remembers which season the user is watching so the detail page's Back link
  // reopens the same season even without a deep-link query param.
  useEffect(() => {
    if (details?.id && hasValidId) {
      saveLastSeason(id, seasonNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.id, hasValidId, seasonNumber]);

  // Approx. episode length (seconds) — used for progress and to decide whether
  // the current episode was finished (so Back can auto-advance to the next).
  const durationSeconds = Math.round((details?.episode_run_time?.[0] || 30) * 60);

  // Track approx. watch progress (time spent) for Continue Watching. The first
  // commit to history + the "watched" marker is deferred until the viewer has
  // actually been watching for a little while (LOG_BEFORE_LOG), so merely opening
  // an episode or tapping the Next button doesn't move the resume point.
  const progressRef = useRef(0);
  const loggedRef = useRef(false);
  // Reactive elapsed-watch seconds so the Back link can reflect whether the user
  // finished the episode. Updated on each tick (a ~5s re-render is negligible).
  const [watchedSeconds, setWatchedSeconds] = useState(0);
  useEffect(() => {
    if (!details?.id || !hasValidId) return;
    progressRef.current = 0;
    loggedRef.current = false;
    setWatchedSeconds(0);
    const write = () => {
      progressRef.current += 5;
      setWatchedSeconds(progressRef.current);
      if (progressRef.current >= LOG_BEFORE_LOG && !loggedRef.current) {
        loggedRef.current = true;
        logPlayed(details, { type: 'tv', season: seasonNumber, episode: episodeNumber });
        markEpisodeWatched(id, seasonNumber, episodeNumber);
      }
      updateWatchProgress(details.id, progressRef.current, durationSeconds, {
        season: seasonNumber,
        episode: episodeNumber,
      });
    };
    const idHandle = setInterval(write, 5000);
    const cleanup = () => {
      clearInterval(idHandle);
      if (progressRef.current > 0) {
        updateWatchProgress(details.id, progressRef.current, durationSeconds, {
          season: seasonNumber,
          episode: episodeNumber,
        });
      }
    };
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.id, hasValidId, seasonNumber, episodeNumber]);

  // True once the viewer has watched ~98% of the episode's duration. Before that,
  // Back re-opens the current episode (Resume) instead of skipping ahead.
  const finished =
    durationSeconds > 0 && watchedSeconds / durationSeconds >= FINISH_THRESHOLD;

  const title = details?.name || 'Series';
  // Auto-advance to the *next* episode so the Back button opens the right season
  // and highlights exactly what to play next. Uses the series' season metadata
  // (episode counts) already fetched in `details` to know the season boundary:
  //   - mid-season            → same season, next episode
  //   - last episode of a season with a following season → next season, ep 1
  //   - series finale         → point at the current episode (nothing after it)
  const seasonNum = Number(season);
  const episodeNum = Number(episode);
  const nextTarget = (() => {
    if (Number.isNaN(seasonNum) || Number.isNaN(episodeNum)) return null;
    const seasonList =
      details?.seasons?.filter((s) => s.season_number > 0 && s.episode_count > 0) ?? [];
    const current = seasonList.find((s) => s.season_number === seasonNum);
    const currentCount = current?.episode_count ?? 0;
    if (currentCount > 0 && episodeNum < currentCount) {
      return { season: seasonNum, episode: episodeNum + 1 };
    }
    const nextSeason = seasonList
      .filter((s) => s.season_number > seasonNum)
      .sort((a, b) => a.season_number - b.season_number)[0];
    if (nextSeason) {
      return { season: nextSeason.season_number, episode: 1 };
    }
    // No later season (or metadata still loading) — don't skip ahead.
    return { season: seasonNum, episode: episodeNum };
  })();

  // The *previous* episode, mirroring nextTarget (rolls back across seasons).
  const prevTarget = (() => {
    if (Number.isNaN(seasonNum) || Number.isNaN(episodeNum)) return null;
    const seasonList =
      details?.seasons?.filter((s) => s.season_number > 0 && s.episode_count > 0) ?? [];
    const current = seasonList.find((s) => s.season_number === seasonNum);
    const currentCount = current?.episode_count ?? 0;
    if (currentCount > 0 && episodeNum > 1) {
      return { season: seasonNum, episode: episodeNum - 1 };
    }
    const prevSeason = seasonList
      .filter((s) => s.season_number < seasonNum)
      .sort((a, b) => b.season_number - a.season_number)[0];
    if (prevSeason) {
      return { season: prevSeason.season_number, episode: prevSeason.episode_count };
    }
    return null; // very first episode of the series — no previous
  })();

  // Whether a real "next" episode exists (mid-season or another season coming).
  const hasNextEpisode = (() => {
    const seasonList =
      details?.seasons?.filter((s) => s.season_number > 0 && s.episode_count > 0) ?? [];
    const current = seasonList.find((s) => s.season_number === seasonNum);
    const currentCount = current?.episode_count ?? 0;
    if (currentCount > 0 && episodeNum < currentCount) return true;
    return seasonList.some((s) => s.season_number > seasonNum);
  })();

  // In-player prev/next buttons jump straight to the neighbouring episode without
  // leaving the player (null when unavailable, e.g. no previous or a finale).
  const prevHref =
    prevTarget != null
      ? `/watch/tv/${id}/${prevTarget.season}/${prevTarget.episode}`
      : null;
  const nextHref =
    hasNextEpisode && nextTarget != null
      ? `/watch/tv/${id}/${nextTarget.season}/${nextTarget.episode}`
      : null;

  // Back button target. Only auto-advance to the *next* episode (and highlight it
  // as "Next up", `n=1`) once the current episode has actually been finished;
  // otherwise re-open the current episode so the detail page highlights the exact
  // spot the user is still watching (Resume).
  const backHref = hasValidId
    ? finished
      ? `/tv/${id}?season=${nextTarget?.season ?? seasonNumber}&episode=${nextTarget?.episode ?? episodeNumber}&n=1`
      : `/tv/${id}?season=${seasonNumber}&episode=${episodeNumber}`
    : '/series';
  const nowLabel = hasValidId
    ? detailsLoading
      ? `Now playing - S${season} E${episode} ...`
      : `Now playing - ${title} - S${season} E${episode}`
    : 'Player';
  const iframeTitle = hasValidId ? `${title} S${season} E${episode} player` : 'Player';
  const notice = (
    <p>
      This player may contain advertisements. For a clean, uninterrupted
      experience, consider using an ad-blocker while streaming.
    </p>
  );

  return (
    <VideoPlayer
      type="tv"
      id={id}
      season={season}
      episode={episode}
      nowLabel={nowLabel}
      backHref={backHref}
      prevHref={prevHref}
      nextHref={nextHref}
      iframeTitle={iframeTitle}
      notice={notice}
    />
  );
}