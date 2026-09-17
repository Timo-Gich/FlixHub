import { useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import VideoPlayer from '../components/VideoPlayer';
import { fetchMovieDetails } from '../services/tmdbService';
import { useMovieData } from '../hooks/useMovieData';
import { logPlayed, updateWatchProgress } from '../services/libraryService';

/**
 * /watch/:id - movie player with a server selector (2Embed / VidSrc / VidCore).
 * Logs to history and tracks approximate watch progress for Continue Watching.
 */
export default function WatchPage() {
  const { id } = useParams();
  const hasValidId = id !== undefined && !Number.isNaN(Number(id));

  // Load the real title so the top bar can show it after "Now playing".
  const { data: details, loading: detailsLoading } = useMovieData(
    () => fetchMovieDetails(id),
    [id],
  );

  // Auto-log to history once the movie is known (fires on "play").
  useEffect(() => {
    if (details?.id) logPlayed(details);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.id]);

  // Track approx. watch progress (time spent) for Continue Watching.
  const progressRef = useRef(0);
  useEffect(() => {
    if (!details?.id) return;
    const durationSeconds = Math.round((details.runtime || 0) * 60);
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
  }, [details?.id]);

  const nowLabel = hasValidId
    ? detailsLoading
      ? 'Now playing - Loading...'
      : details?.title
        ? `Now playing - ${details.title}`
        : `Now playing - TMDb #${id}`
    : 'Movie player';
  const backHref = hasValidId ? `/movie/${id}` : '/';
  const iframeTitle = hasValidId ? `Movie ${id} player` : 'Movie player';
  const notice = (
    <p>
      This movie is delivered by a third-party embedded player and may contain
      advertisements. For a clean, uninterrupted experience, consider using an
      ad-blocker while streaming.
    </p>
  );

  return (
    <VideoPlayer
      type="movie"
      id={id}
      nowLabel={nowLabel}
      backHref={backHref}
      iframeTitle={iframeTitle}
      notice={notice}
    />
  );
}