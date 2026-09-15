import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import VideoPlayer from '../components/VideoPlayer';
import { fetchTVDetails } from '../services/tmdbService';
import { useMovieData } from '../hooks/useMovieData';
import { logPlayed, updateWatchProgress } from '../services/libraryService';

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

  // Auto-log to history (plays => type tv, with season/episode) once known.
  useEffect(() => {
    if (details?.id && hasValidId) {
      logPlayed(details, { type: 'tv', season: Number(season), episode: Number(episode) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.id, hasValidId]);

  // Track approx. watch progress (time spent) for Continue Watching.
  const progressRef = useRef(0);
  useEffect(() => {
    if (!details?.id || !hasValidId) return;
    const durationSeconds = Math.round((details?.episode_run_time?.[0] || 30) * 60);
    progressRef.current = 0;
    const write = () => {
      progressRef.current += 5;
      updateWatchProgress(details.id, progressRef.current, durationSeconds);
    };
    const idHandle = setInterval(write, 5000);
    const cleanup = () => {
      clearInterval(idHandle);
      if (progressRef.current > 0) {
        updateWatchProgress(details.id, progressRef.current, durationSeconds);
      }
    };
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.id, hasValidId]);

  const title = details?.name || 'Series';
  const nowLabel = hasValidId
    ? detailsLoading
      ? `Now playing - S${season} E${episode} ...`
      : `Now playing - ${title} - S${season} E${episode}`
    : 'Player';
  const backHref = hasValidId ? `/tv/${id}` : '/series';
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
      iframeTitle={iframeTitle}
      notice={notice}
    />
  );
}