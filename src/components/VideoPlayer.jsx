import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useEmbedServer from '../hooks/useEmbedServer';
import ServerDropdown from './ServerDropdown';

// Third-party player notice visibility timing.
const NOTE_VISIBLE_MS = 5000; // How long the note stays fully shown.
const NOTE_FADE_MS = 1000; // Fade-out duration (matches the CSS transition).

/**
 * Shared movie / TV player with a server dropdown.
 *
 * Renders an always-visible top bar containing the Back button, the
 * "Now playing" label and a single server dropdown (Server 1/2/3). The player
 * iframe is keyed by its src so switching servers remounts it and forces the
 * new source to load, with a loading spinner while it does.
 *
 * Props:
 *   - type        : 'movie' | 'tv'
 *   - id          : TMDb id (or IMDb id for the IMDb watch route)
 *   - season      : (TV only) season number
 *   - episode     : (TV only) episode number
 *   - servers     : optional server list override (e.g. IMDb-only VidSrc)
 *   - rawId       : true → treat id as a raw (non-numeric) id like "tt…"
 *   - nowLabel    : text for the top bar ("Now playing · …")
 *   - backHref    : route the Back button links to
 *   - prevHref    : (TV) link for the Previous-episode button, or null
 *   - nextHref    : (TV) link for the Next-episode button, or null
 *   - iframeTitle : accessibility title for the iframe
 *   - notice      : ReactNode shown as the ad-blocker notice
 */
export default function VideoPlayer({
  type,
  id,
  season,
  episode,
  servers,
  rawId,
  nowLabel,
  backHref,
  prevHref,
  nextHref,
  iframeTitle,
  notice,
}) {
  const {
    servers: activeServers,
    activeServerId,
    selectServer,
    source,
    imdbLoading,
  } = useEmbedServer({ type, id, season, episode, servers, validateId: !rawId });

  const [playerLoading, setPlayerLoading] = useState(true);
  // Track the third-party notice lifecycle: visible → fading → hidden.
  const [noticeState, setNoticeState] = useState('');

  useEffect(() => {
    const fade = setTimeout(() => setNoticeState('fading'), NOTE_VISIBLE_MS);
    const hide = setTimeout(
      () => setNoticeState('hidden'),
      NOTE_VISIBLE_MS + NOTE_FADE_MS,
    );
    return () => {
      clearTimeout(fade);
      clearTimeout(hide);
    };
  }, []);

  // Reset the loading spinner whenever the source changes (e.g. a new server).
  useEffect(() => {
    setPlayerLoading(true);
  }, [source]);

  // Only show the IMDb-fetch spinner over the player when the ACTIVE server
  // actually needs an IMDb id (avoids flashing on Server 1 / Server 3).
  const activeServer = activeServers.find((s) => s.id === activeServerId);
  const showSpinner = playerLoading || (imdbLoading && activeServer?.usesImdb);

  return (
    <div className="relative flex min-h-screen flex-col bg-ink text-foreground">
      {/* Always-visible top bar */}
      <div className="flex items-center gap-3 border-b border-ink-border bg-ink-raised px-3 py-2.5 text-sm shadow-md">
        <Link
          to={backHref}
          className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md bg-ink-raised px-3 py-1.5
                     font-semibold text-white ring-1 ring-ink-border transition
                     hover:bg-brand hover:text-white"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        {(prevHref || nextHref) && (
          <span
            role="group"
            aria-label="Episode navigation"
            className="inline-flex items-center gap-1"
          >
            {prevHref && (
              <Link
                to={prevHref}
                aria-label="Previous episode"
                title="Previous episode"
                className="inline-flex w-fit items-center justify-center rounded-md bg-ink-raised px-2 py-1.5
                           text-white ring-1 ring-ink-border transition hover:bg-brand hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
            {nextHref && (
              <Link
                to={nextHref}
                aria-label="Next episode"
                title="Next episode"
                className="inline-flex w-fit items-center justify-center rounded-md bg-ink-raised px-2 py-1.5
                           text-white ring-1 ring-ink-border transition hover:bg-brand hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="-scale-x-100 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </Link>
            )}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm text-muted">{nowLabel}</span>
        <ServerDropdown
          servers={activeServers}
          activeServerId={activeServerId}
          onSelect={selectServer}
          loadingImdb={imdbLoading}
        />
      </div>

      {/* Player */}
      <div className="relative flex-1 bg-ink">
        {showSpinner && (
          <div
            role="status"
            className="absolute inset-0 z-10 flex items-center justify-center bg-ink/80"
          >
            <span
              className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent"
              aria-hidden="true"
            />
            <span className="sr-only">Loading player…</span>
          </div>
        )}

        {source ? (
          <iframe
            key={source}
            src={source}
            title={iframeTitle}
            className="absolute inset-0 block aspect-video h-full w-full border-0"
            allow="autoplay; fullscreen; encrypted-media"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            onLoad={() => setPlayerLoading(false)}
          />
        ) : (
          !showSpinner && (
            <div className="flex h-full items-center justify-center px-6">
              <div className="mx-auto max-w-xl text-center">
                <h1 className="text-2xl font-black text-white">Player unavailable</h1>
                <p className="mt-3 text-sm text-muted">
                  The source for this title could not be loaded. Try a different server.
                </p>
              </div>
            </div>
          )
        )}
      </div>

      {/* Third-party ad-blocker notice — auto-fades after a few seconds */}
      {notice && noticeState !== 'hidden' && (
        <div
          role="status"
          className={`pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-ink/90
                     px-4 pb-3 pt-2 text-center text-xs leading-relaxed text-muted
                     transition-opacity duration-1000
                     ${noticeState === 'fading' ? 'opacity-0' : 'opacity-100'}`}
        >
          {notice}
        </div>
      )}
    </div>
  );
}