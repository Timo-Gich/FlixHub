import { useMemo, useRef, useState, useEffect } from 'react';
import { MediaPlayer, MediaProvider, Track } from '@vidstack/react';
import { DefaultVideoLayout, defaultLayoutIcons } from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/base.css';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';

// NOTE: no hls.js import — proxied MP4 plays natively. HLS branch (raw .m3u8)
// is handled by Vidstack's built-in provider without extra config.

const FAIL_FAST_MS = 8000;
// CDN (bcdn nginx) throttles bursts: back off 2s -> 4s -> 8s on 429.
const BACKOFF_MS = [2000, 4000, 8000];
const DEBUG = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

export default function HlsPlayer({ src, title, tracks = [], onFallbackServer }) {
  const [status, setStatus] = useState('loading'); // loading | healthy | throttled | unavailable
  const [retryKey, setRetryKey] = useState(0);
  const [throttleMsg, setThrottleMsg] = useState('');
  const startedRef = useRef(false);
  const attemptAt = useRef(performance.now());
  const backoffRef = useRef(0);
  const timerRef = useRef(null);

  // Stable key per src only — retryKey remounts ONLY on user Retry.
  const key = useMemo(() => src, [src]);
  const mediaSrc = useMemo(() => {
    if (!src) return null;
    return { src, type: 'video/mp4' };
  }, [src]);
  // VTT-only: Vidstack <Track> supports VTT, not SRT (SRT blocks canplay).
  const vttTracks = useMemo(() => {
    const list = Array.isArray(tracks) ? tracks : [];
    const vtt = list.filter((t) => /\.vtt($|\?)/i.test(t?.url || '') || (t?.type || '').toLowerCase() === 'vtt');
    return vtt.slice(0, 8).map((t, i) => ({
      url: t.url,
      lang: t.lang || `Subtitles ${i + 1}`,
      srclang: (t.lang || 'en').slice(0, 2).toLowerCase(),
    }));
  }, [tracks]);

  useEffect(() => {
    if (DEBUG) console.log('[Server7/HlsPlayer] mount src:', (src || '').slice(0, 100));
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const failFast = () => !startedRef.current && performance.now() - attemptAt.current >= FAIL_FAST_MS;

  // 429 from bcdn nginx (forwarded by /api/stream): back off, don't spin forever.
  const scheduleBackoffRetry = (retryAfterSec) => {
    const idx = Math.min(backoffRef.current, BACKOFF_MS.length - 1);
    const wait = retryAfterSec != null ? retryAfterSec * 1000 : BACKOFF_MS[idx];
    backoffRef.current += 1;
    setStatus('throttled');
    setThrottleMsg(`CDN is busy — retrying in ${Math.ceil(wait / 1000)}s… (${backoffRef.current}/3)`);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (backoffRef.current > BACKOFF_MS.length) {
        setStatus('unavailable');
        return;
      }
      startedRef.current = false;
      attemptAt.current = performance.now();
      setStatus('loading');
      setRetryKey((k) => k + 1);
    }, wait);
  };

  const handleError = (detail) => {
    const code = detail?.code ?? detail?.status ?? detail;
    if (code === 429 || detail === 429) {
      if (backoffRef.current <= BACKOFF_MS.length) {
        scheduleBackoffRetry(detail?.retryAfter);
        return;
      }
    }
    if (failFast()) setStatus('unavailable');
  };

  return (
    <div className="hls-server7 absolute inset-0 bg-black">
      {status !== 'unavailable' && src && (
        <MediaPlayer
          key={`${key}#${retryKey}`}
          src={mediaSrc}
          viewType="video"
          streamType="on-demand"
          title={title}
          playsInline
          autoPlay
          muted
          onCanPlay={() => { startedRef.current = true; setStatus('healthy'); }}
          onPlaying={() => { startedRef.current = true; setStatus('healthy'); }}
          onPlay={() => { startedRef.current = true; setStatus('healthy'); }}
          onLoadedMetadata={() => { startedRef.current = true; setStatus('healthy'); }}
          onError={(e) => { if (DEBUG) console.warn('[Server7/HlsPlayer] media error:', e?.detail || e); handleError(e?.detail); }}
        >
          {/* Native MP4 provider only — no HLS probing on extensionless proxy URL. */}
          <MediaProvider />
          {vttTracks.map((t, i) => (
            <Track
              key={`${t.url}-${i}`}
              src={t.url}
              kind="subtitles"
              label={t.lang}
              srclang={t.srclang}
              type="vtt"
            />
          ))}
          <DefaultVideoLayout icons={defaultLayoutIcons} />
        </MediaPlayer>
      )}
      {/* Single buffering indicator — parent owns the "resolving" spinner,
          this one only shows while the media element buffers. */}
      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
          <span className="sr-only">Loading stream…</span>
        </div>
      )}
      {status === 'throttled' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" />
          <p className="text-sm font-semibold text-white">{throttleMsg || 'CDN is busy — retrying…'}</p>
          <p className="max-w-md text-xs text-muted">The video host is rate-limiting requests. Waiting before retrying, or pick another server.</p>
          {onFallbackServer && (
            <button
              type="button"
              onClick={onFallbackServer}
              className="mt-1 rounded-md border border-ink-border bg-ink-raised px-5 py-2 text-xs font-semibold text-white hover:border-brand"
            >
              Try Server 1 instead
            </button>
          )}
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
