import { useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LiveChannelCard from '../components/LiveChannelCard';
import LiveHero from '../components/LiveHero';
import LiveGuide from '../components/LiveGuide';
import {
  fetchPlaylist, resetPlaylistCache, EPG_REGIONS, fetchEPGForRegions, getRegionForCountry,
  matchProgrammes, pickFeaturedOnNow, sliceWindow,
} from '../services/liveTvService';
import { useLibrary } from '../hooks/useLibrary.jsx';

const REGION_KEY = 'flixhub.liveRegion';
const VIEW_KEY = 'flixhub.liveView';
const COUNTRY_KEY = 'flixhub.liveCountry';
const COUNTRY_ALL = '__all__';

function readRegion() {
  try {
    const saved = localStorage.getItem(REGION_KEY);
    if (saved && EPG_REGIONS.some((r) => r.code === saved)) return saved;
  } catch {
    /* ignore storage errors */
  }
  return 'US';
}

function readCountry() {
  try {
    return localStorage.getItem(COUNTRY_KEY) || COUNTRY_ALL;
  } catch {
    return COUNTRY_ALL;
  }
}

function countryLabel(code) {
  const normalized = code.toUpperCase();
  const region = EPG_REGIONS.find((item) => item.code === normalized);
  if (region) return region.label;
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

const TAB_ALL = '__all__';
const TAB_FAVORITES = '__favorites__';
const PAGE_SIZE = 48;
const GUIDE_ROWS = 30;
const GUIDE_HOURS = 4;

// The active category/search are kept in sessionStorage so returning from a
// channel player lands the user back on the same tab they were viewing.
const LIVE_TAB_KEY = 'flixhub.liveTab';
const LIVE_QUERY_KEY = 'flixhub.liveQuery';

function readStoredTab() {
  try {
    return sessionStorage.getItem(LIVE_TAB_KEY) || TAB_ALL;
  } catch {
    return TAB_ALL;
  }
}

function readStoredQuery() {
  try {
    return sessionStorage.getItem(LIVE_QUERY_KEY) || '';
  } catch {
    return '';
  }
}

/**
 * /live — professional Live TV browser: On-Now hero, EPG guide + grid views,
 * favorites, search, and region-driven programme data.
 */
export default function LiveTVPage() {
  const [channels, setChannels] = useState(null); // null = loading
  const [error, setError] = useState(false);
  const [region, setRegion] = useState(readRegion);
  const [country, setCountry] = useState(readCountry);
  const [view, setView] = useState(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY);
      if (v === 'guide' || v === 'grid') return v;
    } catch { /* ignore */ }
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 'grid' : 'guide';
  });
  const [tab, setTab] = useState(readStoredTab);
  const [query, setQuery] = useState(readStoredQuery);
  const { favoritesLive: favState } = useLibrary();
  const [page, setPage] = useState(1);
  const [guidePage, setGuidePage] = useState(1);
  const [epgMaps, setEpgMaps] = useState({});
  const [epgStatus, setEpgStatus] = useState('idle');
  const [clock, setClock] = useState(Date.now());
  const bounds = useMemo(() => {
    const s = Math.floor(Date.now() / (30 * 60000)) * (30 * 60000) - 30 * 60000;
    return { winStart: s, winEnd: s + GUIDE_HOURS * 3600000 };
  }, []);
  const epgReqRef = useRef(0);
  const tabRailRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateRailArrows = () => {
    const el = tabRailRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    updateRailArrows();
    window.addEventListener('resize', updateRailArrows);
    return () => window.removeEventListener('resize', updateRailArrows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channels]);

  const scrollRail = (dir) => {
    const el = tabRailRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  // Keep the active tab visible when it changes.
  useEffect(() => {
    const el = tabRailRef.current;
    if (!el) return;
    const active = el.querySelector('[data-active="true"]');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }, [tab]);

  useEffect(() => {
    let cancelled = false;
    fetchPlaylist().then((list) => {
      if (cancelled) return;
      if (!list.length) setError(true);
      setChannels(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Favorites come from the cloud-aware hook — no local subscription needed.

  // Persist the chosen region so the player page can use it for EPG.
  useEffect(() => {
    try {
      localStorage.setItem(REGION_KEY, region);
    } catch {
      /* ignore storage errors */
    }
  }, [region]);

  useEffect(() => {
    try {
      localStorage.setItem(COUNTRY_KEY, country);
    } catch {
      /* ignore storage errors */
    }
  }, [country]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch { /* ignore */ }
  }, [view]);

  useEffect(() => {
    const id = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // Remember the active tab & search across the session so returning from a
  // channel player restores the view the user was on.
  useEffect(() => {
    try {
      sessionStorage.setItem(LIVE_TAB_KEY, tab);
    } catch {
      /* ignore storage errors */
    }
  }, [tab]);

  useEffect(() => {
    try {
      sessionStorage.setItem(LIVE_QUERY_KEY, query);
    } catch {
      /* ignore storage errors */
    }
  }, [query]);

  const loading = channels === null && !error;

  const categories = useMemo(() => {
    const set = new Set();
    (channels || []).forEach((c) => {
      if (c.category) set.add(c.category);
    });
    // Dedupe: priority cats first, then the rest alphabetically.
    const priority = ['News', 'Sports', 'Movies', 'Music', 'Entertainment'].filter((c) => set.has(c));
    const rest = [...set].filter((c) => !priority.includes(c)).sort((a, b) => a.localeCompare(b));
    return [...priority, ...rest];
  }, [channels]);

  const countries = useMemo(() => {
    const codes = new Set((channels || []).map((channel) => channel.country).filter((code) => /^[a-z]{2}$/i.test(code || '')));
    return [...codes].sort((a, b) => countryLabel(a).localeCompare(countryLabel(b)));
  }, [channels]);

  // If the restored tab no longer matches a real category (stale playlist or
  // session), fall back to "All" once the category list is known.
  useEffect(() => {
    if (loading) return;
    const valid =
      tab === TAB_ALL || tab === TAB_FAVORITES || categories.includes(tab);
    if (!valid) setTab(TAB_ALL);
  }, [loading, tab, categories]);

  const favorites = useMemo(() => favState.map((e) => e.channel), [favState]);
// Apply tab + search filtering client-side.
  const visible = useMemo(() => {
    let list = channels || [];
    if (tab === TAB_FAVORITES) list = favorites;
    else if (tab !== TAB_ALL) list = list.filter((c) => c.category === tab);
    if (country !== COUNTRY_ALL) list = list.filter((c) => c.country?.toUpperCase() === country);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((c) => (c.name || '').toLowerCase().includes(q));
    return list;
  }, [channels, tab, favorites, country, query]);

  const tabs = [
    { key: TAB_ALL, label: 'All' },
    {
      key: TAB_FAVORITES,
      label: `Favorites${favorites.length ? ` (${favorites.length})` : ''}`,
    },
    ...categories.map((c) => ({ key: c, label: c })),
  ];

  const emptyVisible = !loading && !error && visible.length === 0;

  // Reset pagination whenever the grid's input set changes.
  useEffect(() => {
    setPage(1);
    setGuidePage(1);
  }, [tab, query, favState, channels, region, country]);

  const viewKey = `${tab}|${query}|${(channels || []).length}|${region}|${country}`;
  // EPG is strictly progressive enhancement: it loads lazily AFTER the
  // channel list renders, never blocks it, and times out fast (8s per
  // region) so a slow XMLTV host can't hang the page.
  useEffect(() => {
    if (!visible.length) {
      setEpgMaps({});
      setEpgStatus('idle');
      return;
    }
    const myReq = epgReqRef.current + 1;
    epgReqRef.current = myReq;
    let cancelled = false;
    setEpgMaps({});
    setEpgStatus('idle');
    // Defer so first paint (channels) always wins over guide data.
    const timer = setTimeout(() => {
      if (cancelled) return;
      setEpgStatus((s) => (s === 'idle' ? 'loading' : s));
      const counts = new Map();
      visible.slice(0, 400).forEach((c) => {
        if (!c.country) return;
        const r = getRegionForCountry(c.country);
        if (r) counts.set(r.code, (counts.get(r.code) || 0) + 1);
      });
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 1).map(([code]) => code);
      const codes = country === COUNTRY_ALL
        ? [...new Set([region, ...top])].filter(Boolean)
        : [country];
      const withTimeout = (p, ms) => Promise.race([
        p,
        new Promise((resolve) => setTimeout(() => resolve({ __timeout: true }), ms)),
      ]);
      withTimeout(fetchEPGForRegions(codes, {
        channels: visible.slice(0, 400),
        from: bounds.winStart,
        to: bounds.winEnd,
      }), 15000).then((maps) => {
        if (cancelled || epgReqRef.current !== myReq) return;
        if (maps && maps.__timeout) { setEpgStatus('empty'); return; }
        setEpgMaps(maps || {});
        const anyData = Object.values(maps || {}).some((m) => m && Object.keys(m).length);
        setEpgStatus(anyData ? 'ready' : 'empty');
      });
    }, 800);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  const epgByChannel = useMemo(() => {
    const map = new Map();
    if (!visible.length || epgStatus === 'loading') return map;
    const codes = Object.keys(epgMaps);
    if (!codes.length) return map;
    // Cap matching work: exact tvg-id lookups are cheap, but the
    // normalized-name fallback scans all EPG keys per channel — 120 max.
    visible.slice(0, 120).forEach((ch) => {
      for (const code of codes) {
        const m = epgMaps[code];
        if (!m || !Object.keys(m).length) continue;
        const res = matchProgrammes(m, ch.tvgId, ch.name, clock);
        if (res.found && (res.now || res.next)) { map.set(ch.id, res); break; }
      }
    });
    return map;
  }, [visible, epgMaps, epgStatus, clock]);

  const featured = useMemo(() => pickFeaturedOnNow(visible, epgByChannel, 5), [visible, epgByChannel]);

  const guideRows = useMemo(() => {
    const withEpg = [];
    const without = [];
    visible.forEach((ch) => {
      const info = epgByChannel.get(ch.id);
      if (info?.now || info?.next) withEpg.push(ch);
      else without.push(ch);
    });
    return [...withEpg, ...without].slice(0, guidePage * GUIDE_ROWS).map((ch) => {
      let entries = [];
      for (const code of Object.keys(epgMaps)) {
        const m = epgMaps[code];
        if (!m) continue;
        const base = String(ch.tvgId || '').split('@')[0];
        if (m[ch.tvgId]?.length) { entries = m[ch.tvgId]; break; }
        if (base && m[base]?.length) { entries = m[base]; break; }
      }
      return { channel: ch, progs: sliceWindow(entries, bounds.winStart, bounds.winEnd) };
    });
  }, [visible, epgByChannel, epgMaps, guidePage, bounds]);
  const guideHasMore = guidePage * GUIDE_ROWS < visible.length;

  const shownCount = Math.min(page * PAGE_SIZE, visible.length);
  const paged = visible.slice(0, shownCount);
  const hasMore = shownCount < visible.length;

  const retry = () => {
    setError(false);
    setChannels(null);
    resetPlaylistCache();
    fetchPlaylist().then((list) => {
      if (!list.length) setError(true);
      setChannels(list);
    });
  };
return (
    <div className="min-h-screen bg-ink text-foreground">
      <Navbar />

      <main className="mx-auto w-full max-w-[1600px] px-4 pt-24 sm:px-8">
        {/* Header */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor"
                     strokeWidth="1.6" aria-hidden="true">
                  <rect x="2" y="7" width="20" height="15" rx="2" />
                  <path d="M10 11.5v1.8a1 1 0 0 0 1.5.9l1.6-.9a1 1 0 0 0 0-1.8l-1.6-.9a1 1 0 0 0-1.5.9z" />
                  <path d="M7 17h10" />
                </svg>
              </span>
              <h1 className="text-2xl font-black text-white sm:text-3xl">Live TV</h1>
              <span className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-brand-light">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                {visible.length ? `${visible.length.toLocaleString()} channels` : 'Guide'}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              What&rsquo;s on now — browse the guide or jump straight in.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-ink-border bg-ink-raised p-0.5" role="tablist" aria-label="Layout">
              {['guide', 'grid'].map((v) => (
                <button key={v} type="button" role="tab" aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={`rounded px-3 py-1.5 text-sm font-semibold capitalize transition ${view === v ? 'bg-brand text-white' : 'text-muted hover:text-white'}`}>
                  {v}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="hidden sm:inline">Country</span>
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                aria-label="Filter channels by country"
                className="rounded-md border border-ink-border bg-ink-raised px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/40"
              >
                <option value={COUNTRY_ALL}>All countries</option>
                {countries.map((code) => (
                  <option key={code} value={code.toUpperCase()}>
                    {countryLabel(code)}
                  </option>
                ))}
              </select>
            </label>
            {/* Region selector (drives EPG country) */}
            <label className="flex items-center gap-2 text-sm text-muted">
              <span className="hidden sm:inline">EPG region</span>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="rounded-md border border-ink-border bg-ink-raised px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-brand/40"
            >
              {EPG_REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            </label>
          </div>
        </div>

        {!loading && !error && featured.length > 0 && (
          <div className="mt-5">
            <LiveHero items={featured} clock={clock} />
          </div>
        )}

        {/* Search */}
        <div className="relative mt-5 max-w-md">
          <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
               fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels or shows…"
            aria-label="Search channels"
            className="w-full rounded-md border border-ink-border bg-ink-raised py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/40"
          />
        </div>

        {/* Category tabs — scrollable rail with edge arrows */}
        <div className="relative mt-6">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollRail(-1)}
              aria-label="Scroll categories left"
              className="absolute -left-1 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-ink-border bg-ink-raised/95 text-white shadow-lg backdrop-blur transition hover:bg-brand sm:flex"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollRail(1)}
              aria-label="Scroll categories right"
              className="absolute -right-1 top-1/2 z-10 hidden h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-ink-border bg-ink-raised/95 text-white shadow-lg backdrop-blur transition hover:bg-brand sm:flex"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          )}
          <div
            ref={tabRailRef}
            onScroll={updateRailArrows}
            className="scrollbar-hide flex gap-2 overflow-x-auto scroll-smooth px-1 pb-1"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                data-active={active}
                onClick={() => setTab(t.key)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-brand text-white'
                    : 'bg-ink-raised text-muted hover:bg-ink-border hover:text-white'
                }`}
              >
                {t.label}
              </button>
            );
          })}
          </div>
        </div>

        {/* Content */}
        <div className="mt-6 pb-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 text-muted">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden="true" />
              <p className="mt-4 text-sm">Loading channels…</p>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
              <p className="text-3xl font-black text-white">Couldn’t load channels</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                The live TV playlist is temporarily unreachable. Check your connection and try again.
              </p>
              <button
                type="button"
                onClick={retry}
                className="mt-6 inline-block rounded-md bg-brand px-6 py-2.5 text-sm font-bold text-white transition hover:bg-brand-dark"
              >
                Try again
              </button>
            </div>
          )}

          {tab === TAB_FAVORITES && !error && favorites.length === 0 && !loading && (
            <div className="rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
              <p className="text-3xl font-black text-white">No favorite channels yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Tap the ♥ on any live channel to pin it here and jump straight back in.
              </p>
            </div>
          )}

          {tab !== TAB_FAVORITES && !error && emptyVisible && (
            <div className="rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
              <p className="text-3xl font-black text-white">No channels found</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">Try a different category or search term.</p>
            </div>
          )}

          {!loading && !error && !emptyVisible && view === 'guide' && (
            <>
              <LiveGuide rows={guideRows} winStart={bounds.winStart} winEnd={bounds.winEnd} clock={clock} epgStatus={epgStatus} />
              {guideHasMore && (
                <div className="mt-6 flex justify-center">
                  <button type="button" onClick={() => setGuidePage((p) => p + 1)}
                    className="rounded-md border border-ink-border bg-ink-raised px-6 py-2.5 text-sm font-semibold text-white transition hover:border-brand hover:bg-brand">
                    Show more channels
                  </button>
                </div>
              )}
            </>
          )}

          {!loading && !error && !emptyVisible && view === 'grid' && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {paged.map((ch) => (
                <LiveChannelCard key={ch.id} channel={ch} epg={epgByChannel.get(ch.id) || null} clock={clock} />
              ))}
            </div>
          )}

          {view === 'grid' && !loading && !error && hasMore && (
            <div className="mt-8 flex justify-center">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                className="rounded-md border border-ink-border bg-ink-raised px-6 py-2.5 text-sm font-semibold text-white transition hover:border-brand hover:bg-brand"
              >
                Load more {Math.min(PAGE_SIZE, visible.length - shownCount)}
              </button>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
