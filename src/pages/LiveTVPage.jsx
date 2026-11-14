import { useEffect, useMemo, useRef, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import LiveChannelCard from '../components/LiveChannelCard';
import { DADDYLIVE_CHANNELS } from '../data/daddyliveChannels';
import { fetchPlaylist, resetPlaylistCache } from '../services/liveTvService';
import { useLibrary } from '../hooks/useLibrary.jsx';

const COUNTRY_KEY = 'flixhub.liveCountry';
const COUNTRY_ALL = '__all__';
const SOURCE_KEY = 'flixhub.liveSource';
const DEFAULT_SOURCE = 'default';
const DADDYLIVE_SOURCE = 'daddylive';

function readSource() {
  try {
    return localStorage.getItem(SOURCE_KEY) === DADDYLIVE_SOURCE ? DADDYLIVE_SOURCE : DEFAULT_SOURCE;
  } catch {
    return DEFAULT_SOURCE;
  }
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
  try {
    return new Intl.DisplayNames(['en'], { type: 'region' }).of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

const TAB_ALL = '__all__';
const TAB_FAVORITES = '__favorites__';
const PAGE_SIZE = 48;

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
 * /live — Live TV channel browser with favorites, search, and filtering.
 */
export default function LiveTVPage({ initialSource = readSource() }) {
  const [channels, setChannels] = useState(null); // null = loading
  const [error, setError] = useState(false);
  const [source, setSource] = useState(initialSource);
  const [country, setCountry] = useState(readCountry);
  const [tab, setTab] = useState(readStoredTab);
  const [query, setQuery] = useState(readStoredQuery);
  const { favoritesLive: favState } = useLibrary();
  const [page, setPage] = useState(1);
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
    if (source !== DEFAULT_SOURCE) return undefined;
    let cancelled = false;
    setError(false);
    fetchPlaylist().then((list) => {
      if (cancelled) return;
      if (!list.length) setError(true);
      setChannels(list);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);

  // Favorites come from the cloud-aware hook — no local subscription needed.

  useEffect(() => {
    try {
      localStorage.setItem(COUNTRY_KEY, country);
    } catch {
      /* ignore storage errors */
    }
  }, [country]);

  useEffect(() => {
    try {
      localStorage.setItem(SOURCE_KEY, source);
    } catch {
      /* ignore storage errors */
    }
  }, [source]);

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
    if (source !== DEFAULT_SOURCE || loading) return;
    const valid =
      tab === TAB_ALL || tab === TAB_FAVORITES || categories.includes(tab);
    if (!valid) setTab(TAB_ALL);
  }, [source, loading, tab, categories]);

  const favorites = useMemo(() => favState.map((e) => e.channel), [favState]);
  const altLiveChannels = DADDYLIVE_CHANNELS;

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

  const altVisible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q
      ? altLiveChannels.filter((channel) => channel.name.toLowerCase().includes(q))
      : altLiveChannels;
  }, [query]);

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
  }, [source, tab, query, favState, channels, country]);

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
  const channelCount = source === DADDYLIVE_SOURCE ? altVisible.length : visible.length;
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
                {channelCount.toLocaleString()} channels
              </span>
            </div>
            <p className="mt-1 text-sm text-muted">
              Browse live channels and start watching.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-ink-border bg-ink-raised p-0.5" role="group" aria-label="Live TV source">
              <button
                type="button"
                aria-pressed={source === DEFAULT_SOURCE}
                onClick={() => setSource(DEFAULT_SOURCE)}
                className={`rounded px-3 py-1.5 text-sm font-semibold transition ${source === DEFAULT_SOURCE ? 'bg-brand text-white' : 'text-muted hover:text-white'}`}
              >
                IPTV
              </button>
              <button
                type="button"
                aria-pressed={source === DADDYLIVE_SOURCE}
                onClick={() => setSource(DADDYLIVE_SOURCE)}
                className={`rounded px-3 py-1.5 text-sm font-semibold transition ${source === DADDYLIVE_SOURCE ? 'bg-brand text-white' : 'text-muted hover:text-white'}`}
              >
                DaddyLive
              </button>
            </div>
            {source === DEFAULT_SOURCE && (
              <>
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
              </>
            )}
          </div>
        </div>

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
            placeholder="Search channels…"
            aria-label="Search channels"
            className="w-full rounded-md border border-ink-border bg-ink-raised py-2.5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/40"
          />
        </div>

        {/* Category tabs — scrollable rail with edge arrows */}
        {source === DEFAULT_SOURCE && <div className="relative mt-6">
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
        </div>}

        {/* Content */}
        <div className="mt-6 pb-4">
          {source === DEFAULT_SOURCE && loading && (
            <div className="flex flex-col items-center justify-center py-24 text-muted">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-brand border-t-transparent" aria-hidden="true" />
              <p className="mt-4 text-sm">Loading channels…</p>
            </div>
          )}

          {source === DEFAULT_SOURCE && error && (
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

          {source === DEFAULT_SOURCE && tab === TAB_FAVORITES && !error && favorites.length === 0 && !loading && (
            <div className="rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
              <p className="text-3xl font-black text-white">No favorite channels yet</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">
                Tap the ♥ on any live channel to pin it here and jump straight back in.
              </p>
            </div>
          )}

          {source === DEFAULT_SOURCE && tab !== TAB_FAVORITES && !error && emptyVisible && (
            <div className="rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
              <p className="text-3xl font-black text-white">No channels found</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">Try a different category or search term.</p>
            </div>
          )}

          {source === DEFAULT_SOURCE && !loading && !error && !emptyVisible && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {paged.map((ch) => (
                <LiveChannelCard key={ch.id} channel={ch} />
              ))}
            </div>
          )}

          {source === DEFAULT_SOURCE && !loading && !error && hasMore && (
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

          {source === DADDYLIVE_SOURCE && altVisible.length === 0 && (
            <div className="rounded-md border border-ink-border bg-ink-soft px-6 py-16 text-center">
              <p className="text-3xl font-black text-white">No channels found</p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted">Try a different search term.</p>
            </div>
          )}

          {source === DADDYLIVE_SOURCE && altVisible.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {altVisible.map((ch) => (
                <LiveChannelCard
                  key={ch.id}
                  channel={ch}
                  to={`/live/daddylive/${encodeURIComponent(ch.id)}`}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
