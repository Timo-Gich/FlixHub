import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  MediaPlayer,
  MediaProvider,
} from '@vidstack/react';
import Hls from 'hls.js';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/base.css';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import ServerDropdown from './ServerDropdown';

const STARTUP_TIMEOUT_MS = 90000;
const STARTUP_RETRY_DELAYS_MS = [5000, 10000, 15000, 20000];

const HLS_CONFIG = {
  liveSyncDurationCount: 3,
  liveMaxLatencyDurationCount: 5,
  maxBufferLength: 15,
  maxMaxBufferLength: 30,
  backBufferLength: 10,
  initialLiveManifestSize: 1,
  lowLatencyMode: true,
  maxLiveSyncPlaybackRate: 1.5,
  enableWorker: true,
  fragLoadingMaxRetry: 6,
  manifestLoadingMaxRetry: 4,
};

export default function LiveVideoPlayer({
  channel,
  backHref,
  servers,
  defaultServerId,
  missing = false,
}) {
  const [activeServerId, setActiveServerId] = useState(defaultServerId);
  const [status, setStatus] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const startedRef = useRef(false);
  const startupRetryCountRef = useRef(0);
  const startupRetryTimerRef = useRef(null);
  const activeServer = servers.find((server) => server.id === activeServerId) || servers[0];
  const playerSrc = channel && activeServer
    ? activeServer.urlBuilder(channel.id, channel)
    : '';

  useEffect(() => {
    if (!servers.some((server) => server.id === activeServerId)) {
      setActiveServerId(defaultServerId || servers[0]?.id);
    }
  }, [activeServerId, defaultServerId, servers]);

  useEffect(() => {
    clearTimeout(startupRetryTimerRef.current);
    startupRetryTimerRef.current = null;
    if (activeServer?.type !== 'hls' || !playerSrc || !channel) {
      setStatus('loading');
      return undefined;
    }

    startedRef.current = false;
    startupRetryCountRef.current = 0;
    setStatus('loading');
    const timer = setTimeout(() => {
      if (!startedRef.current) setStatus('unavailable');
    }, STARTUP_TIMEOUT_MS);
    return () => {
      clearTimeout(timer);
      clearTimeout(startupRetryTimerRef.current);
      startupRetryTimerRef.current = null;
    };
  }, [activeServer?.type, channel?.id, playerSrc, retryKey]);

  const markActive = () => {
    startedRef.current = true;
    startupRetryCountRef.current = 0;
    clearTimeout(startupRetryTimerRef.current);
    startupRetryTimerRef.current = null;
    setStatus('healthy');
  };

  const scheduleStartupRetry = () => {
    if (startedRef.current || startupRetryTimerRef.current) return;
    const retryDelay = STARTUP_RETRY_DELAYS_MS[startupRetryCountRef.current];
    if (retryDelay === undefined) return;
    startupRetryCountRef.current += 1;
    startupRetryTimerRef.current = setTimeout(() => {
      startupRetryTimerRef.current = null;
      if (!startedRef.current) setStartupAttempt((attempt) => attempt + 1);
    }, retryDelay);
  };

  const onHlsInstance = (event) => {
    const hls = event.detail;
    if (!hls) return;
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data?.fatal) return;
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad();
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError();
      }
    });
  };

  const retryStream = () => {
    clearTimeout(startupRetryTimerRef.current);
    startupRetryTimerRef.current = null;
    startupRetryCountRef.current = 0;
    startedRef.current = false;
    setStatus('loading');
    setRetryKey((key) => key + 1);
  };

  return (
    <>
      <div className="flex items-center gap-3 border-b border-ink-border bg-ink-raised px-3 py-2.5 text-sm shadow-md">
        <Link
          to={backHref}
          className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md bg-ink-raised px-3 py-1.5 font-semibold text-white ring-1 ring-ink-border transition hover:bg-brand"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Live TV
        </Link>
        <span className="min-w-0 flex-1 truncate text-muted">Live · {channel?.name || 'Channel'}</span>
        <ServerDropdown
          servers={servers}
          activeServerId={activeServer?.id}
          onSelect={setActiveServerId}
        />
      </div>

      <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-8">
        <div className="relative aspect-video overflow-hidden rounded-lg border border-ink-border bg-black">
          {missing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="text-2xl font-black text-white">Channel not found</p>
              <p className="max-w-md text-sm text-muted">
                We couldn’t find that channel. It may have been removed from the live TV feed.
              </p>
              <Link to={backHref} className="rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark">
                Browse Live TV
              </Link>
            </div>
          )}

          {!channel && !missing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden="true" />
              <span className="sr-only">Loading channel…</span>
            </div>
          )}

          {channel && activeServer?.type === 'iframe' && (
            <iframe
              key={playerSrc}
              src={playerSrc}
              title={`${channel.name} player`}
              className="absolute inset-0 block h-full w-full border-0"
              allow="autoplay; fullscreen; encrypted-media"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          )}

          {channel && activeServer?.type === 'hls' && status === 'unavailable' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="text-2xl font-black text-white">This channel is currently unavailable</p>
              <p className="max-w-md text-sm text-muted">
                Live streams go offline from time to time. Try again or come back in a moment.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={retryStream}
                  className="rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark"
                >
                  Try again
                </button>
                <Link
                  to={backHref}
                  className="rounded-md border border-ink-border bg-ink-raised px-6 py-2.5 text-sm font-semibold text-white transition hover:border-brand hover:bg-brand"
                >
                  Try Another Channel
                </Link>
              </div>
            </div>
          )}

          {channel && activeServer?.type === 'hls' && status !== 'unavailable' && playerSrc && (
            <MediaPlayer
              key={`${playerSrc}#retry-${retryKey}#attempt-${startupAttempt}`}
              src={playerSrc}
              playsInline
              autoPlay
              onCanPlay={markActive}
              onPlaying={markActive}
              onTimeUpdate={markActive}
              onError={scheduleStartupRetry}
              onHlsInstance={onHlsInstance}
            >
              <MediaProvider library={Hls} config={HLS_CONFIG} />
              <DefaultVideoLayout icons={defaultLayoutIcons} noScrubber={false} />
            </MediaPlayer>
          )}

          {channel && activeServer?.type === 'hls' && status === 'loading' && playerSrc && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden="true" />
              <span className="sr-only">Connecting to live stream…</span>
            </div>
          )}

          {channel && activeServer?.type === 'hls' && !playerSrc && (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-muted">
              No HLS stream is configured for this channel.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
