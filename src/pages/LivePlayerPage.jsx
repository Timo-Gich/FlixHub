import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Footer from '../components/Footer';
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
import {
  fetchPlaylist,
  fetchEPGForRegions,
  getNowNextAcrossRegions,
  getUpcoming,
  programmeProgress,
  formatRange as formatProgRange,
  getRegionByCode,
  getRegionForCountry,
} from '../services/liveTvService';
import { getFavoritesLive } from '../services/libraryService';

const REGION_KEY = 'flixhub.liveRegion';
// Public IPTV streams go offline a lot — if the player hasn't produced any media
// within this window we surface a friendly "unavailable" state. Generous window
// to also absorb serverless-proxy cold starts and slow first segments.
const HEALTH_TIMEOUT_MS = 12000;
const PROG_REFRESH_MS = 60000;

// Aggressive hls.js tuning for low-latency live streams (see usage below).
const HLS_CONFIG = {
  maxBufferLength: 15,
  maxMaxBufferLength: 30,
  backBufferLength: 10,
  initialLiveManifestSize: 1,
  lowLatencyMode: true,
  maxLiveSyncPlaybackRate: 1.1,
  enableWorker: true,
};

// Timing tunables for the live-stream networking strategy (see handlers below).
const FALLBACK_WINDOW_MS = 5000;
const SOURCE_FAIL_FAST_MS = 5000;
const STALL_RELOAD_DELAY_MS = 3000;

function readRegion() {
  try {
    const saved = localStorage.getItem(REGION_KEY);
    if (saved) return saved;
  } catch {
    /* ignore storage errors */
  }
  return 'US';
}

function safeDecode(param) {
  try {
    return decodeURIComponent(param || '');
  } catch {
    return param || '';
  }
}

function formatClock(ms) {
  if (!ms || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
/**
 * /live/:channelId — self-hosted HLS player + EPG rail (Now/Up next).
 */
export default function LivePlayerPage() {
  const { channelId } = useParams();
  const decoded = safeDecode(channelId);

  const [channel, setChannel] = useState(null);
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState('loading'); // loading | healthy | unavailable
  // True once the stream has shown any activity (playing OR time has advanced) —
  // used to keep the health-probe timeout/error from killing an already-working
  // channel. Bumped to force a fresh player mount on "Try again".
  const startedRef = useRef(false);
  const [retryKey, setRetryKey] = useState(0);
  // --- Live networking strategy state (see handlers below) ---
  const [sourceMode, setSourceMode] = useState('direct'); // 'direct' | 'proxy'
  const sourceModeRef = useRef('direct');
  const directFailedRef = useRef(false);
  const attemptStartedAtRef = useRef(0);
  const stallTimerRef = useRef(null);
  const stallArmedRef = useRef(false);
  const autoReloadedRef = useRef(false);
  const [stallReloadKey, setStallReloadKey] = useState(0);

  // src strategy: hit the raw stream first, fall back to the serverless proxy.
  const playerSrc = (() => {
    if (!channel?.streamUrl) return '';
    if (sourceMode !== 'proxy') return channel.streamUrl;
    const q = new URLSearchParams({ url: channel.streamUrl });
    if (channel.userAgent) q.set('ua', channel.userAgent);
    return `/api/proxy?${q.toString()}`;
  })();
  // The user's explicitly selected region (persisted by the /live browser),
  // plus the region auto-derived from the channel's own country code.
  const [userRegion] = useState(readRegion);
  const [epgMaps, setEpgMaps] = useState({}); // regionCode -> XMLTV map
  // Bumped every minute so "now / next" stays current while the strip is open.
  const [clock, setClock] = useState(Date.now());

  // Resolve the channel from the playlist, falling back to favorites.
  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    setChannel(null);
    fetchPlaylist().then((list) => {
      if (cancelled) return;
      const found =
        list.find((c) => c.id === decoded || c.tvgId === decoded) ?? null;
      if (found) {
        setChannel(found);
        return;
      }
      const fav = getFavoritesLive()
        .map((e) => e.channel)
        .find((c) => c.id === decoded || c.tvgId === decoded);
      setChannel(fav ?? null);
      if (!fav) setMissing(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decoded]);

  // Channel health probe: fail fast within the timeout if nothing starts playing.
  // A ref tracks whether playback actually began, so the timeout only fires while
  // we're still waiting — it must never flip a healthy stream to "unavailable".
  useEffect(() => {
    if (!channel?.streamUrl) return;
    startedRef.current = false;
    setStatus('loading');
    const timer = setTimeout(() => {
      if (!startedRef.current) setStatus('unavailable');
    }, HEALTH_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // retryKey restarts the window each time the user hits "Try again".
  }, [channel?.id, channel?.streamUrl, retryKey, sourceMode, stallReloadKey]);

  // Keep the ref used by the fallback logic in sync with the state.
  useEffect(() => {
    sourceModeRef.current = sourceMode;
  }, [sourceMode]);

  // Reset the networking strategy on each fresh load (new channel or a manual
  // Try again) so we always try the direct URL first again.
  useEffect(() => {
    if (!channel?.streamUrl) return;
    setSourceMode('direct');
    directFailedRef.current = false;
    autoReloadedRef.current = false;
    stallArmedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel?.streamUrl, retryKey]);

  // Restart the early-failure window each time the src changes (direct -> proxy)
  // so the proxy attempt gets its own fresh window before it is judged.
  useEffect(() => {
    if (!playerSrc) return;
    attemptStartedAtRef.current = performance.now();
    if (!playerSrc.startsWith('/api/proxy')) directFailedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerSrc]);

  // Periodic clock tick to advance the Now Playing strip.
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), PROG_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  // Auto-derive a region from the channel's country (deep-linked channels then
  // don't depend on the user having picked the matching region). User choice is
  // still kept as a fallback so an explicit selection is never ignored.
  const channelRegion = channel ? getRegionForCountry(channel.country) : null;
  const regionCodes = channelRegion
    ? [channelRegion.code, userRegion].filter(
        (c) => c && c !== channelRegion.code,
      )
    : [userRegion];

  // Fetch XMLTV (cached) for every candidate region.
  useEffect(() => {
    setEpgMaps({});
    let cancelled = false;
    fetchEPGForRegions(regionCodes).then((maps) => {
      if (cancelled) return;
      setEpgMaps(maps);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionCodes.join(',')]);

  // Resolve current + next programme, preferring the region that actually has
  // data for this channel so auto-derived regions lift the hit rate for
  // deep-linked channels.
  const programs = (() => {
    if (!channel) return { now: null, next: null, found: false, region: null, entries: [] };
    return getNowNextAcrossRegions(epgMaps, channel, clock);
  })();
  const upcoming = getUpcoming(programs.entries || [], programs.now || programs.next, 4);
  const nowPct = programmeProgress(programs.now, clock);

  const backToLive = '/live';

  // -------------------------------------------------------------------------
  // Live-stream networking + resilience strategy.
  //  1. Attack the raw stream first (lowest latency).
  //  2. If hls.js reports a NETWORK_ERROR / CORS-ish failure within 5s of the
  //     attempt starting and nothing has begun playing, transparently switch to
  //     the /api/proxy endpoint (fetches server-side, bypassing CORS + mixed-content).
  //  3. If the stream stalls, silently reload it once after 3s; if it still
  //     never produces A/V after that reload, surface the unavailable panel.
  //  4. Once playback is active we never tear the player down on a transient hiccup.
  // -------------------------------------------------------------------------

  const markActive = () => {
    startedRef.current = true;
    setStatus('healthy');
  };

  const clearStallTimer = () => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
    stallArmedRef.current = false;
  };

  const onPlaying = () => {
    clearStallTimer();
    autoReloadedRef.current = false; // a new stall episode may reload again
    markActive();
  };
  // Time advancing means we are definitely not stalled.
  const onTimeUpdate = () => {
    clearStallTimer();
    markActive();
  };

  // Stall handling: after ~3s of buffering with no progress, reload the current
  // src once. A second stall (after the one auto-reload) with no playback yet
  // means the stream is genuinely stuck.
  const onWaiting = () => {
    if (stallTimerRef.current || stallArmedRef.current) return;
    stallArmedRef.current = true;
    stallTimerRef.current = setTimeout(() => {
      stallTimerRef.current = null;
      stallArmedRef.current = false;
      if (!autoReloadedRef.current) {
        autoReloadedRef.current = true;
        setStallReloadKey((k) => k + 1); // silent reload of the current src
      } else if (!startedRef.current) {
        setStatus('unavailable');
      }
    }, STALL_RELOAD_DELAY_MS);
  };

  // Switch the current attempt from direct to /api/proxy. Returns true when it
  // actually switched, so callers keep waiting instead of surfacing an error.
  const tryProxyFallback = () => {
    if (startedRef.current) return false; // already playing - leave it
    if (sourceModeRef.current !== 'direct' || directFailedRef.current) return false;
    if (performance.now() - attemptStartedAtRef.current > FALLBACK_WINDOW_MS) return false;
    directFailedRef.current = true;
    setSourceMode('proxy');
    return true;
  };

  // Only fail fast once the current attempt (direct OR proxy) has had a real
  // chance; a just-switched proxy gets its own window before we give up.
  const shouldFailFast = () =>
    startedRef.current
      ? false
      : performance.now() - attemptStartedAtRef.current >= SOURCE_FAIL_FAST_MS;

  // hls.js surfaced an error (data is HLS.ErrorData).
  const onHlsError = (data) => {
    if (!data) return;
    if (tryProxyFallback()) return; // direct failed -> retry via proxy
    if (shouldFailFast()) setStatus('unavailable');
  };

  // Native media error (also the path Vidstack uses when a source fails).
  const onError = () => {
    if (tryProxyFallback()) return; // direct failed -> retry via proxy
    if (shouldFailFast()) setStatus('unavailable');
  };

  // Try again: remount the player to re-attempt the same stream (some channels
  // only work on a second attempt, same as a manual refresh).
  const retryStream = () => {
    clearStallTimer();
    startedRef.current = false;
    setStatus('loading');
    setStallReloadKey((k) => k + 1);
    setRetryKey((k) => k + 1);
  };
return (
    <div className="min-h-screen bg-ink text-foreground">
      {/* Top bar */}
      <div className="flex items-center gap-3 border-b border-ink-border bg-ink-raised px-3 py-2.5 text-sm shadow-md">
        <Link
          to="/live"
          className="inline-flex w-fit shrink-0 items-center gap-2 rounded-md bg-ink-raised px-3 py-1.5 font-semibold text-white ring-1 ring-ink-border transition hover:bg-brand"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Live TV
        </Link>
        <span className="min-w-0 flex-1 truncate text-muted">Live · {channel?.name || 'Channel'}</span>
      </div>

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-6 sm:px-8">
        {/* Channel identity */}
        {channel && (
          <div className="mb-4 flex items-center gap-3">
            {channel.logo ? (
              <img
                src={channel.logo}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                className="h-12 w-12 shrink-0 rounded-lg border border-ink-border bg-ink-raised object-contain p-1"
              />
            ) : (
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-ink-raised text-xl font-black text-white/40">
                {(channel.name || '?').trim().charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black text-white">{channel.name}</h1>
              <p className="flex items-center gap-2 text-xs text-muted">
                {channel.category && <span>{channel.category}</span>}
                {channel.country && <span>· {channel.country.toUpperCase()}</span>}
                <span className="inline-flex items-center gap-1 text-brand-light">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-light" aria-hidden="true" />
                  LIVE
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Player / unavailable */}
        <div className="relative aspect-video overflow-hidden rounded-lg border border-ink-border bg-black">
          {missing && !channel && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
              <p className="text-2xl font-black text-white">Channel not found</p>
              <p className="max-w-md text-sm text-muted">
                We couldn’t find that channel. It may have been removed from the live TV feed.
              </p>
              <Link to="/live" className="rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark">
                Browse Live TV
              </Link>
            </div>
          )}

          {channel && status === 'unavailable' && (
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
                  to="/live"
                  className="rounded-md border border-ink-border bg-ink-raised px-6 py-2.5 text-sm font-semibold text-white transition hover:border-brand hover:bg-brand"
                >
                  Try Another Channel
                </Link>
              </div>
            </div>
          )}

          {channel && status !== 'unavailable' && !missing && (
            <MediaPlayer
              key={`${playerSrc}#retry-${retryKey}#stall-${stallReloadKey}`}
              src={playerSrc}
              playsInline
              autoPlay
              onPlaying={onPlaying}
              onTimeUpdate={onTimeUpdate}
              onError={onError}
              onHlsError={onHlsError}
              onWaiting={onWaiting}
            >
              <MediaProvider library={Hls} config={HLS_CONFIG} />
              <DefaultVideoLayout icons={defaultLayoutIcons} noScrubber={false} />
            </MediaPlayer>
          )}

          {channel && status === 'loading' && !missing && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden="true" />
              <span className="sr-only">Connecting to live stream…</span>
            </div>
          )}
        </div>

        {/* Programme guide rail */}
        {channel && (
          <div className="mt-4 overflow-hidden rounded-lg border border-ink-border bg-ink-raised">
            <div className="flex items-center justify-between gap-3 border-b border-ink-border px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-light">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" />
                  <circle cx="12" cy="19" r="1.6" /><circle cx="5" cy="5" r="1.6" />
                  <circle cx="5" cy="12" r="1.6" /><circle cx="5" cy="19" r="1.6" />
                  <circle cx="19" cy="5" r="1.6" /><circle cx="19" cy="12" r="1.6" />
                  <circle cx="19" cy="19" r="1.6" />
                </svg>
                Now Playing
              </h2>
              <span className="text-xs text-muted">
                EPG · {programs.region?.label ?? 'Guide'}
              </span>
            </div>

            <div className="p-4">
              {programs.now ? (
                <div>
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded bg-brand px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Now
                    </span>
                    <span className="text-base font-semibold text-white">{programs.now.title}</span>
                    <span className="text-xs text-muted">
                      {formatProgRange(programs.now.startMs, programs.now.stopMs)}
                    </span>
                  </p>
                  {nowPct != null && (
                    <span className="mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round(nowPct * 100)}%` }} />
                    </span>
                  )}
                  {upcoming.length > 0 && (
                    <div className="mt-3 border-t border-ink-border pt-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted">Up next</p>
                      <ul className="mt-2 space-y-2">
                        {upcoming.map((u) => (
                          <li key={u.startMs} className="flex items-center justify-between gap-3 text-sm">
                            <span className="truncate font-medium text-white/90">{u.title}</span>
                            <span className="shrink-0 text-xs text-muted">{formatClock(u.startMs)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : programs.next ? (
                <div>
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-white/80">Next</span>
                    <span className="text-base font-semibold text-white">{programs.next.title}</span>
                    <span className="text-xs text-muted">{formatClock(programs.next.startMs)}</span>
                  </p>
                  {upcoming.length > 0 && (
                    <ul className="mt-3 space-y-2 border-t border-ink-border pt-3">
                      {upcoming.map((u) => (
                        <li key={u.startMs} className="flex items-center justify-between gap-3 text-sm">
                          <span className="truncate font-medium text-white/90">{u.title}</span>
                          <span className="shrink-0 text-xs text-muted">{formatClock(u.startMs)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted">
                  {programs.found
                    ? 'Programme schedule is not available at this time.'
                    : 'No programme guide found for this channel in the selected region.'}
                </p>
              )}
              <Link to="/live"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-light hover:text-white">
                ← Open full TV guide
              </Link>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
