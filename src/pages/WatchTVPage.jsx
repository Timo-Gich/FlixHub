import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { fetchTVDetails } from '../services/tmdbService';
import { useMovieData } from '../hooks/useMovieData';
import { logPlayed, updateWatchProgress } from '../services/libraryService';

const VIDKING_TV_EMBED_BASE = 'https://www.vidking.net/embed/tv/';

const NOTE_VISIBLE_MS = 5000;
const NOTE_FADE_MS = 1000;
const BAR_VISIBLE_MS = 3000;
const BAR_FADE_MS = 600;

/**
 * /watch/tv/:id/:season/:episode — full-viewport VidKing TV player. Back goes
 * to the series detail page; plays are logged to history with season/episode
 * so Continue Watching can show the last watched episode.
 */
export default function WatchTVPage() {
  const { id, season, episode } = useParams();
  const navigate = useNavigate();

  const hasValidId =
    id !== undefined &&
    !Number.isNaN(Number(id)) &&
    season !== undefined &&
    !Number.isNaN(Number(season)) &&
    episode !== undefined &&
    !Number.isNaN(Number(episode));
  const embedSrc = hasValidId ? `${VIDKING_TV_EMBED_BASE}${id}/${season}/${episode}` : null;

  const { data: details, loading: detailsLoading } = useMovieData(() => fetchTVDetails(id), [id]);

  // Ad-blocker note lifecycle.
  const [noticeState, setNoticeState] = useState('');
  useEffect(() => {
    const fadeTimer = setTimeout(() => setNoticeState('fading'), NOTE_VISIBLE_MS);
    const hideTimer = setTimeout(() => setNoticeState('hidden'), NOTE_VISIBLE_MS + NOTE_FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  // Auto-hide top bar, reappearing on mouse/touch activity.
  const [barVisible, setBarVisible] = useState(true);
  const barTimerRef = useRef();
  const rearmBar = useCallback(() => {
    setBarVisible(true);
    clearTimeout(barTimerRef.current);
    barTimerRef.current = setTimeout(() => setBarVisible(false), BAR_VISIBLE_MS);
  }, []);
  useEffect(() => {
    rearmBar();
    const wake = () => rearmBar();
    window.addEventListener('mousemove', wake, { passive: true });
    window.addEventListener('touchstart', wake, { passive: true });
    return () => {
      clearTimeout(barTimerRef.current);
      window.removeEventListener('mousemove', wake);
      window.removeEventListener('touchstart', wake);
    };
  }, [rearmBar]);

  // Auto-log to history (plays => type tv, with season/episode) once known.
  useEffect(() => {
    if (details?.id && hasValidId) {
      logPlayed(details, { type: 'tv', season: Number(season), episode: Number(episode) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.id, hasValidId]);

  // Progress tracking (approximated by time on the player).
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
  const backPath = hasValidId ? `/tv/${id}` : '/';
  const nowLabel = hasValidId
    ? detailsLoading
      ? `Now playing · S${season} E${episode} …`
      : `Now playing · ${title} · S${season} E${episode}`
    : 'Player';

  return (
    <div className="relative flex min-h-screen flex-col bg-ink">
      {/* Full-viewport player */}
      {embedSrc ? (
        <div className="relative w-full flex-1 bg-ink">
          <iframe
            src={embedSrc}
            title={`${title} S${season} E${episode} player`}
            className="absolute inset-0 block h-full w-full border-0"
            allow="fullscreen; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6">
          <div className="mx-auto max-w-xl text-center">
            <h1 className="text-2xl font-black text-white">Player unavailable</h1>
            <p className="mt-3 text-sm text-muted">The show, season or episode is missing or invalid.</p>
            <Link
              to="/series"
              className="mt-5 inline-block rounded-md bg-brand px-6 py-2.5 text-sm font-bold
                         text-white transition hover:bg-brand-dark"
            >
              Back to Series
            </Link>
          </div>
        </div>
      )}

      {/* Top bar — overlay that auto-hides */}
      <div
        aria-hidden={!barVisible}
        className={`absolute inset-x-0 top-0 z-40 transition-all duration-600 ${
          barVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-ink-border bg-ink-raised px-3 py-2.5 text-sm shadow-md">
          <Link
            to={backPath}
            className="inline-flex w-fit items-center gap-2 rounded-md bg-ink-raised px-3 py-1.5
                       font-semibold text-white ring-1 ring-ink-border transition hover:bg-brand"
          >
            ← Back
          </Link>
          <span className="truncate text-sm text-muted">{nowLabel}</span>
        </div>
      </div>

      {/* Ad-blocker note — shows, then fades */}
      {noticeState !== 'hidden' && (
        <div
          role="status"
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-ink/90
                      px-4 pb-3 pt-2 text-center text-xs leading-relaxed text-muted
                      transition-opacity duration-1000
                      ${noticeState === 'fading' ? 'opacity-0' : 'opacity-100'}`}
        >
          <p>
            This player may contain advertisements. For a clean, uninterrupted
            experience, consider using an ad-blocker while streaming.
          </p>
        </div>
      )}
    </div>
  );
}