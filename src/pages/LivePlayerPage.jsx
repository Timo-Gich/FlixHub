import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Footer from '../components/Footer';
import {
  MediaPlayer,
  MediaProvider,
} from '@vidstack/react';
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from '@vidstack/react/player/layouts/default';
import '@vidstack/react/player/styles/base.css';
import '@vidstack/react/player/styles/default/theme.css';
import '@vidstack/react/player/styles/default/layouts/video.css';
import {
  fetchPlaylist,
  fetchEPG,
  matchProgrammes,
  getRegionByCode,
  getRegionForCountry,
  buildStreamUrl,
  parseChannelRef,
} from '../services/liveTvService';
import { getFavoritesLive } from '../services/libraryService';

const REGION_KEY = 'flixhub.liveRegion';
// Public IPTV streams go offline a lot — if the player hasn't produced any media
// within this window we surface a friendly "unavailable" state. Generous window
// to also absorb serverless-proxy cold starts and slow first segments.
const HEALTH_TIMEOUT_MS = 12000;
const PROG_REFRESH_MS = 60000;

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
 * /live/:channelId — a self-hosted HLS player for a single live channel.
 *
 * Resolves the channel from the cached playlist (or favorites), renders a
 * Vidstack player driven by hls.js, watches for an early failure (offline
 * streams) to show a friendly "unavailable" state, and shows the current +
 * next programme from XMLTV EPG in a "Now Playing" strip.
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
    // Channel ids from non-default sources are namespaced (e.g. `ke:CitizenTV.ke`),
    // so resolve the owning source before fetching its playlist. World IP TV ids
    // carry no prefix and default to the primary source.
    const { sourceId, channelId } = parseChannelRef(decoded);
    fetchPlaylist(sourceId).then((list) => {
      if (cancelled) return;
      const found =
        list.find(
          (c) => c.id === decoded || c.id === channelId || c.tvgId === channelId,
        ) ?? null;
      if (found) {
        setChannel(found);
        return;
      }
      const fav = getFavoritesLive()
        .map((e) => e.channel)
        .find(
          (c) => c.id === decoded || c.id === channelId || c.tvgId === channelId,
        );
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
  }, [channel?.id, channel?.streamUrl, retryKey]);

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

  // Fetch XMLTV for every candidate region and store each map separately.
  useEffect(() => {
    setEpgMaps({});
    let cancelled = false;
    Promise.all(
      regionCodes.map((code) =>
        fetchEPG(code).then((map) => ({ code, map })),
      ),
    ).then((results) => {
      if (cancelled) return;
      const merged = {};
      results.forEach((r) => {
        merged[r.code] = r.map;
      });
      setEpgMaps(merged);
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
    if (!channel) return { now: null, next: null, found: false, region: null };
    const empty = { now: null, next: null, found: false, region: null };
    for (const code of regionCodes) {
      const map = epgMaps[code];
      if (!map || !Object.keys(map).length) continue;
      const res = matchProgrammes(map, channel.tvgId, channel.name, clock);
      if (res.found && (res.now || res.next)) {
        return { ...res, region: getRegionByCode(code) };
      }
    }
    // No region had schedule data — surface the first non-empty attempt so the
    // strip can still explain why (attributed to a real region).
    for (const code of regionCodes) {
      const map = epgMaps[code];
      if (!map || !Object.keys(map).length) continue;
      const res = matchProgrammes(map, channel.tvgId, channel.name, clock);
      return { ...res, region: getRegionByCode(code) };
    }
    return empty;
  })();

  const backToLive = '/live';

  // Player event handlers for the health probe. "Started" means the player has
  // shown any activity — either it's actually playing, or time has advanced
  // (even if the video is still buffering on a black screen). Once that happens
  // we never flip to the unavailable panel.
  const markActive = () => {
    startedRef.current = true;
    setStatus('healthy');
  };
  const onPlaying = markActive;
  const onTimeUpdate = markActive;
  // Only surface "unavailable" from an error while we're still waiting for the
  // stream to show any activity. After that, a transient hls.js hiccup shouldn't
  // tear down the player — Vidstack handles recovery itself.
  const onError = () => {
    if (!startedRef.current) setStatus('unavailable');
  };

  // "Try again": remount the player to re-attempt the same stream (some channels
  // only work on a second attempt, same as a manual refresh).
  const retryStream = () => {
    startedRef.current = false;
    setStatus('loading');
    setRetryKey((k) => k + 1);
  };

  // Route the stream through the serverless proxy (CORS + mixed-content + UA).
  const proxySrc = channel ? buildStreamUrl(channel) : '';
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
              key={`${proxySrc}#retry-${retryKey}`}
              src={proxySrc}
              playsInline
              autoPlay
              onPlaying={onPlaying}
              onTimeUpdate={onTimeUpdate}
              onError={onError}
            >
              <MediaProvider />
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

        {/* Now Playing strip */}
        {channel && (
          <div className="mt-4 rounded-lg border border-ink-border bg-ink-raised p-4">
            <div className="flex items-center justify-between gap-3">
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

            {programs.now ? (
              <div className="mt-3">
                <p className="flex flex-wrap items-baseline gap-2">
                  <span className="text-base font-semibold text-white">{programs.now.title}</span>
                  <span className="text-xs text-muted">
                    {formatClock(programs.now.startMs)} – {formatClock(programs.now.stopMs)}
                  </span>
                </p>
                {programs.next && (
                  <p className="mt-2 flex flex-wrap items-baseline gap-2 border-t border-ink-border pt-2 text-sm">
                    <span className="text-muted">Up next</span>
                    <span className="font-medium text-white/90">{programs.next.title}</span>
                    <span className="text-xs text-muted">{formatClock(programs.next.startMs)}</span>
                  </p>
                )}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">
                {programs.found
                  ? 'Programme schedule is not available at this time.'
                  : 'No programme guide found for this channel in the selected region.'}
              </p>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}