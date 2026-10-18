import { useMemo, useRef, useState } from 'react';
import { MediaPlayer, MediaProvider, Track } from '@vidstack/react';
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

export default function HlsPlayer({ src, title, tracks = [], onFallbackServer }) {
  const [status, setStatus] = useState('loading');
  const [retryKey, setRetryKey] = useState(0);
  const startedRef = useRef(false);
  const attemptAt = useRef(performance.now());

  const key = useMemo(() => `${src}#${retryKey}`, [src, retryKey]);
  // /api/stream URLs carry no extension: force explicit MP4 type so Vidstack
  // never probes for HLS and plays the proxied progressive file directly.
  const isProxyMp4 = (src || '').includes('/api/stream');
  const mediaSrc = useMemo(() => {
    if (!src) return null;
    if (isProxyMp4) return { src, type: 'video/mp4' };
    return src;
  }, [src, isProxyMp4]);
  console.log('[Server7/HlsPlayer] src passed to MediaPlayer:', typeof mediaSrc === 'object' ? `${mediaSrc.type} :: ${(mediaSrc.src || '').slice(0, 100)}...` : (mediaSrc || '').slice(0, 100));

  const failFast = () => !startedRef.current && performance.now() - attemptAt.current >= FAIL_FAST_MS;

  const handleError = () => {
    if (failFast()) setStatus('unavailable');
  };

  return (
    <div className="hls-server7 absolute inset-0 bg-black">
      {status !== 'unavailable' && src && (
        <MediaPlayer
          key={key}
          src={mediaSrc}
          viewType="video"
          streamType="on-demand"
          title={title}
          playsInline
          autoPlay
          muted={false}
          onCanPlay={() => { startedRef.current = true; setStatus('healthy'); }}
          onPlaying={() => { startedRef.current = true; setStatus('healthy'); }}
          onPlay={() => { startedRef.current = true; setStatus('healthy'); }}
          onLoadedMetadata={() => { startedRef.current = true; setStatus('healthy'); }}
          onError={(e) => { console.warn('[Server7/HlsPlayer] media error:', e?.detail || e); handleError(); }}
          onHlsError={(d) => { console.warn('[Server7/HlsPlayer] hls error:', d?.code, d?.fatal); if (d?.fatal) handleError(); }}
        >
          {/* Proxied MP4: NO HLS library — native playback only. */}
          <MediaProvider config={HLS_CONFIG} />
          {/* click-to-play fallback: autoplay is often blocked, and the
              overlay spinner otherwise sits on top forever looking "stuck" */}
          {status === 'loading' && (
            <button
              type="button"
              aria-label="Play video"
              onClick={() => {
                const v = document.querySelector('.hls-server7 video');
                if (v) v.play().catch(() => {});
                setStatus('healthy');
              }}
              className="absolute inset-0 z-20 flex cursor-pointer items-center justify-center bg-black/40"
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-white shadow-xl transition hover:scale-105">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
              </span>
            </button>
          )}
          {tracks.slice(0, 20).map((t, i) => (
            <Track
              key={`${t.url}-${i}`}
              src={t.url}
              kind="subtitles"
              label={t.lang || `Subtitles ${i + 1}`}
              srclang={(t.lang || 'en').slice(0, 2).toLowerCase()}
              type={/\.vtt($|\?)/i.test(t.url || '') ? 'vtt' : 'srt'}
            />
          ))}
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
