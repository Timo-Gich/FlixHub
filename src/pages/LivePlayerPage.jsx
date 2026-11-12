import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Footer from '../components/Footer';
import LiveVideoPlayer from '../components/LiveVideoPlayer';
import {
  fetchPlaylist,
  fetchEPGForRegions,
  getNowNextAcrossRegions,
  getUpcoming,
  programmeProgress,
  formatRange as formatProgRange,
  getRegionForCountry,
  DEFAULT_EPG_REGION,
} from '../services/liveTvService';
import { LIVE_SERVERS } from '../services/liveServers';

const COUNTRY_KEY = 'flixhub.liveCountry';
const COUNTRY_ALL = '__all__';
const PROG_REFRESH_MS = 60000;

function readCountry() {
  try {
    const saved = localStorage.getItem(COUNTRY_KEY);
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
  // Use the same country selected in the Live TV browser; with "All countries",
  // use the channel's own country.
  const [selectedCountry] = useState(readCountry);
  const [epgMaps, setEpgMaps] = useState({}); // regionCode -> XMLTV map
  // Bumped every minute so "now / next" stays current while the strip is open.
  const [clock, setClock] = useState(Date.now());

  // Resolve the channel and its backend stream endpoint from the server cache.
  useEffect(() => {
    let cancelled = false;
    setMissing(false);
    setChannel(null);
    fetchPlaylist().then((list) => {
      if (cancelled) return;
      const found = list.find((c) => c.id === decoded || c.tvgId === decoded) ?? null;
      setChannel(found);
      if (!found) setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [decoded]);

  // Periodic clock tick to advance the Now Playing strip.
  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), PROG_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const guideRegion = selectedCountry !== COUNTRY_ALL
    ? getRegionForCountry(selectedCountry)
    : channel && getRegionForCountry(channel.country);
  const regionCode = guideRegion?.code || DEFAULT_EPG_REGION;

  // Request this channel's bounded guide window from the backend.
  useEffect(() => {
    setEpgMaps({});
    let cancelled = false;
    if (!channel) return undefined;
    fetchEPGForRegions([regionCode], {
      channels: [channel],
      from: Date.now() - 60 * 60 * 1000,
      to: Date.now() + 12 * 60 * 60 * 1000,
    }).then((maps) => {
      if (!cancelled) setEpgMaps(maps);
    }).catch((error) => {
      console.error('[live-tv] could not load player guide:', error);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionCode, channel?.id]);

  // Resolve current + next programme from the selected/channel country guide.
  const programs = (() => {
    if (!channel) return { now: null, next: null, found: false, region: null, entries: [] };
    return getNowNextAcrossRegions(epgMaps, channel, clock);
  })();
  const upcoming = getUpcoming(programs.entries || [], programs.now || programs.next, 4);
  const nowPct = programmeProgress(programs.now, clock);

return (
    <div className="min-h-screen bg-ink text-foreground">
      <LiveVideoPlayer
        channel={channel}
        missing={missing}
        backHref="/live"
        servers={LIVE_SERVERS}
        defaultServerId="default"
      />

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
