import { useMemo, useRef, useState } from 'react';
import { MediaPlayer, MediaProvider } from '@vidstack/react';
import Hls from 'hls.js';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/base.css';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

// Aggressive buffer + retry tuning for VOD HLS.
const HLS_CONFIG = {
  maxBufferLength: 15,
  maxMaxBufferLength: 30,
  backBufferLength: 10,
  fragLoadingMaxRetry: 6,
  manifestLoadingMaxRetry: 3,
  levelLoadingMaxRetry: 4,
  enableWorker: true,
};

const FAIL_FAST_MS = 8000;

export default function HlsPlayer({ src, title, onFallbackServer }) {
  const [status, setStatus] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);
  const startedRef = useRef(false);
  const attemptAt = useRef(performance.now());

  const key = useMemo(() => `${src}#${retryKey}`, [src, retryKey]);

  const failFast = () => !startedRef.current && performance.now() - attemptAt.current >= FAIL_FAST_MS;

  const handleError = () => {
    if (failFast()) setStatus('unavailable');
  };

  return (
    <div className="absolute inset-0 bg-black">
      {status !== 'unavailable' && src && (
        <MediaPlayer
          key={key}
          src={src}
          title={title}
          playsInline
          autoPlay
          onPlaying={() => { startedRef.current = true; setStatus('healthy'); }}
          onError={handleError}
          onHlsError={(d) => { if (d?.fatal) handleError(); }}
        >
          <MediaProvider library={Hls} config={HLS_CONFIG} />
          <DefaultVideoLayout icons={defaultLayoutIcons} />
        </MediaPlayer>
      )}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
          <span className="sr-only">Loading stream…</span>
        </div>
      )}
      {status === 'unavailable' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-2xl font-black text-white">Stream unavailable</p>
          <p className="max-w-md text-sm text-muted">The direct stream failed to load. Retry or use another server.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => { startedRef.current = false; attemptAt.current = performance.now(); setStatus('loading'); setRetryKey((k) => k + 1); }}
              className="rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white hover:bg-brand-dark"
            >
              Retry
            </button>
            {onFallbackServer && (
              <button
                type="button"
                onClick={onFallbackServer}
                className="rounded-md border border-ink-border bg-ink-raised px-6 py-2.5 text-sm font-semibold text-white hover:border-brand"
              >
                Try Server 1
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
