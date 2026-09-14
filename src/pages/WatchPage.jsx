import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchMovieDetails } from '../services/tmdbService';
import { useMovieData } from '../hooks/useMovieData';
import { logPlayed, updateWatchProgress } from '../services/libraryService';

const VIDKING_EMBED_BASE = 'https://www.vidking.net/embed/movie/';

// Third-party player notice visibility timing.
const NOTE_VISIBLE_MS = 5000; // How long the note is fully shown.
const NOTE_FADE_MS = 1000; // Fade-out duration (matches the CSS transition).

// Top bar auto-hide timing.
const BAR_VISIBLE_MS = 3000; // How long the bar stays before fading out.
const BAR_FADE_MS = 600; // Fade-out duration (matches the CSS transition).

/**
 * Dedicated movie player page. Renders the VidKing embeddable player inside a
 * full-viewport, responsive iframe, with a slim top bar containing a Back
 * button. A brief note about third-party advertisements appears over the
 * player, stays for a few seconds, then fades away.
 *
 * URL: /watch/:id   (where :id is the TMDb movie id)
 */
export default function WatchPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  // Track the ad-blocker note lifecycle: visible → fading → hidden (removed).
  const [noticeState, setNoticeState] = useState('');
  useEffect(() => {
    const fadeTimer = setTimeout(() => setNoticeState('fading'), NOTE_VISIBLE_MS);
    const hideTimer = setTimeout(() => setNoticeState('hidden'), NOTE_VISIBLE_MS + NOTE_FADE_MS);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  // Auto-hide the top bar so the movie is clearly visible. It reappears whenever
  // the user moves the mouse / touches the screen. Window-level listeners are
  // used because the full-screen iframe swallows hover events over itself.
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

  // Guard against a missing/invalid id so we never render a broken iframe src.
  const hasValidId = id !== undefined && !Number.isNaN(Number(id));
  const embedSrc = hasValidId ? `${VIDKING_EMBED_BASE}${id}` : null;

  // Load the movie's real title so the top bar can show it after "Now playing".
  const { data: details, loading: detailsLoading } = useMovieData(
    () => fetchMovieDetails(id),
    [id],
  );

  // Auto-log to watch history once the movie is known (fires on "play").
  useEffect(() => {
    if (details?.id) logPlayed(details);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.id]);

  // Track watch progress periodically. VidKing doesn't expose playback
  // position, so we approximate progress by time spent on the player and
  // persist it every few seconds plus on leaving the page.
  const progressRef = useRef(0);
  useEffect(() => {
    if (!details?.id) return;
    const durationSeconds = Math.round((details.runtime || 0) * 60);
    progressRef.current = 0;
    const write = () => {
      progressRef.current += 5;
      updateWatchProgress(details.id, progressRef.current, durationSeconds);
    };
    const id = setInterval(write, 5000);
    const cleanup = () => {
      clearInterval(id);
      if (progressRef.current > 0) {
        updateWatchProgress(details.id, progressRef.current, durationSeconds);
      }
    };
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [details?.id]);

  return (
    <div className="relative flex min-h-screen flex-col bg-ink">
      {/* Slim top bar — overlay that auto-hides so the movie is clearly visible */}
      <div
        aria-hidden={!barVisible}
        className={`absolute inset-x-0 top-0 z-40 transition-all duration-600 ${
          barVisible
            ? 'translate-y-0 opacity-100'
            : '-translate-y-2 opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-ink-border bg-ink-raised px-3 py-2.5 text-sm shadow-md">
          <button
            type="button"
            onClick={() => navigate(hasValidId ? `/movie/${id}` : '/')}
            className="inline-flex w-fit items-center gap-2 rounded-md bg-ink-raised px-3 py-1.5
                       font-semibold text-white ring-1 ring-ink-border transition
                       hover:bg-brand hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <span className="truncate text-sm text-muted">
            {hasValidId
              ? detailsLoading
                ? 'Now playing · Loading…'
                : details?.title
                  ? `Now playing · ${details.title}`
                  : `Now playing · TMDb #${id}`
              : 'Movie player'}
          </span>
        </div>
      </div>

      {/* Player fills the remaining viewport */}
      {embedSrc ? (
        <div className="relative w-full flex-1 bg-ink">
          <iframe
            src={embedSrc}
            title={`Movie ${id} player`}
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
            <p className="mt-3 text-sm text-muted">
              The movie id is missing or invalid. Go back and choose another title.
            </p>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="mt-5 rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white
                         transition hover:bg-brand-dark"
            >
              Back to home
            </button>
          </div>
        </div>
      )}

      {/* Third-party player notice — floats over the player, stays, then fades out */}
      {noticeState !== 'hidden' && (
        <div
          role="status"
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-ink/90
                      px-4 pb-3 pt-2 text-center text-xs leading-relaxed text-muted
                      transition-opacity duration-1000
                      ${noticeState === 'fading' ? 'opacity-0' : 'opacity-100'}`}
        >
          <p>
            This movie is delivered by a third-party embedded player (VidKing) and
            may contain advertisements. For a clean, uninterrupted experience,
            consider using an ad-blocker while streaming.
          </p>
        </div>
      )}
    </div>
  );
}